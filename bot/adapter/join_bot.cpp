#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <sys/stat.h>
#include <glib.h>
#include "zoom_sdk.h"
#include "auth_service_interface.h"
#include "meeting_service_interface.h"
#include "meeting_service_components/meeting_recording_interface.h"
USING_ZOOM_SDK_NAMESPACE

static GMainLoop* loop=nullptr;
static IMeetingService* g_meeting=nullptr;
static UINT64 g_mn=0;
static const char* g_psw="";
static const char* g_userName="Meeting notes";
static const char* g_leaveFlag="";
static int g_exit=3;
static bool g_inMeeting=false;
static bool g_waitPrinted=false;

// Exit codes: 0=ok 2=failed 3=unknown 4=bad-args 5=init-fail 6=join-fail 7=wait-timeout 8=passcode-required
#define HARD_CAP_SECONDS (4*3600)
#define WAIT_CAP_SECONDS (20*60)

static gboolean do_leave(gpointer){ if(g_meeting) g_meeting->Leave(LEAVE_MEETING); return FALSE; }

static gboolean check_leave_flag(gpointer) {
  if(!g_leaveFlag||!*g_leaveFlag) return G_SOURCE_REMOVE;
  struct stat st;
  if(stat(g_leaveFlag,&st)==0){
    printf("LEAVE-FLAG-DETECTED\n"); fflush(stdout);
    do_leave(nullptr);
    return G_SOURCE_REMOVE;
  }
  return G_SOURCE_CONTINUE;
}

static gboolean hard_timeout(gpointer){ printf("HARD-TIMEOUT\n"); fflush(stdout); g_main_loop_quit(loop); return G_SOURCE_REMOVE; }
static gboolean wait_timeout(gpointer){ printf("WAIT-TIMEOUT\n"); fflush(stdout); g_exit=7; do_leave(nullptr); return G_SOURCE_REMOVE; }

class MeetEvent : public IMeetingServiceEvent {
public:
 void onMeetingStatusChanged(MeetingStatus status,int iResult) override {
  printf("MEETING-STATUS=%d result=%d\n",(int)status,iResult); fflush(stdout);

  // Waiting room / waiting for host — WAIT states
  if(status==MEETING_STATUS_WAITINGFORHOST||status==MEETING_STATUS_IN_WAITING_ROOM){
    if(!g_waitPrinted){
      printf("WAITING-ROOM\n"); fflush(stdout);
      g_waitPrinted=true;
      g_timeout_add_seconds(WAIT_CAP_SECONDS,wait_timeout,NULL);
    }
    return;
  }

  if(status==MEETING_STATUS_INMEETING){
    if(!g_inMeeting){
      g_inMeeting=true;
      printf("IN-MEETING-OK\n"); fflush(stdout);
      g_exit=0;
      IMeetingRecordingController* rc=g_meeting->GetMeetingRecordingController();
      if(rc){ printf("CAN-RAW-RECORD=%d\n",(int)rc->CanStartRawRecording()); fflush(stdout); }
      // Permanent mic mute; never unmute
      IMeetingAudioController* ac=g_meeting->GetMeetingAudioController();
      if(ac){ ac->MuteAudio(0,false); }
      // Poll leave flag every 2s
      if(g_leaveFlag&&*g_leaveFlag){
        g_timeout_add_seconds(2,check_leave_flag,NULL);
      }
    }
    return;
  }

  if(status==MEETING_STATUS_FAILED){
    // iResult==10 is MEETING_FAIL_INVALID_ARGUMENTS; treat as passcode-required
    // when we have not yet entered the meeting and a passcode was absent/wrong.
    // SDK 7.1 Linux does not have a dedicated passcode-required callback, so we
    // use this heuristic. Document uncertainty in SKILL-APPLICATION.md.
    if(!g_inMeeting&&iResult==10){
      printf("PASSCODE-REQUIRED\n"); fflush(stdout);
      g_exit=8;
    } else {
      g_exit=2;
    }
    g_main_loop_quit(loop);
    return;
  }

  if(status==MEETING_STATUS_ENDED){ g_main_loop_quit(loop); return; }
 }
 void onMeetingStatisticsWarningNotification(StatisticsWarningType) override {}
 void onMeetingParameterNotification(const MeetingParameter*) override {}
 void onSuspendParticipantsActivities() override {}
 void onAICompanionActiveChangeNotice(bool) override {}
 void onMeetingTopicChanged(const zchar_t*) override {}
 void onMeetingFullToWatchLiveStream(const zchar_t*) override {}
 void onUserNetworkStatusChanged(MeetingComponentType,ConnectionQuality,unsigned int,bool) override {}
};

class AuthEvent : public IAuthServiceEvent {
public:
 void onAuthenticationReturn(AuthResult ret) override {
  printf("AUTH-RESULT=%d\n",(int)ret); fflush(stdout);
  if(ret!=AUTHRET_SUCCESS){ g_exit=2; g_main_loop_quit(loop); return; }
  if(CreateMeetingService(&g_meeting)!=SDKERR_SUCCESS||!g_meeting){ printf("MEETSVC-FAIL\n"); g_exit=5; g_main_loop_quit(loop); return; }
  static MeetEvent me;
  g_meeting->SetEvent(&me);
  JoinParam jp;
  memset(&jp,0,sizeof(jp));
  jp.userType=SDK_UT_WITHOUT_LOGIN;
  jp.param.withoutloginuserJoin.meetingNumber=g_mn;
  jp.param.withoutloginuserJoin.userName=g_userName;
  jp.param.withoutloginuserJoin.psw=g_psw;
  jp.param.withoutloginuserJoin.isVideoOff=true;
  jp.param.withoutloginuserJoin.isAudioOff=false;
  SDKError e=g_meeting->Join(jp);
  printf("JOIN-CALL=%d\n",(int)e); fflush(stdout);
  if(e!=SDKERR_SUCCESS){ g_exit=6; g_main_loop_quit(loop); }
 }
 void onLoginReturnWithReason(LOGINSTATUS,IAccountInfo*,LoginFailReason) override {}
 void onLogout() override {}
 void onZoomIdentityExpired() override {}
 void onZoomAuthIdentityExpired() override {}
};

static void print_usage(const char* prog){
  fprintf(stderr,"usage: %s <meeting_number> [positional_passcode] [--passcode X] [--name \"display name\"] [--leave-flag <path>]\n",prog);
}

int main(int argc,char** argv){
  if(argc<2){ print_usage(argv[0]); return 4; }

  g_mn=strtoull(argv[1],nullptr,10);
  if(!g_mn){ print_usage(argv[0]); return 4; }

  // Positional passcode for v1 backwards compat
  if(argc>2&&argv[2][0]!='-') g_psw=argv[2];

  // Named args
  for(int i=2;i<argc;i++){
    if(strcmp(argv[i],"--passcode")==0&&i+1<argc){ g_psw=argv[++i]; }
    else if(strcmp(argv[i],"--name")==0&&i+1<argc){ g_userName=argv[++i]; }
    else if(strcmp(argv[i],"--leave-flag")==0&&i+1<argc){ g_leaveFlag=argv[++i]; }
  }

  const char* j=getenv("SMC_ZOOM_JWT");
  if(!j||!*j){ fprintf(stderr,"NO-JWT\n"); return 4; }

  InitParam ip;
  ip.strWebDomain="https://zoom.us";
  ip.enableLogByDefault=true;
  ip.rawdataOpts.audioRawdataMemoryMode=ZoomSDKRawDataMemoryModeHeap;
  ip.rawdataOpts.videoRawdataMemoryMode=ZoomSDKRawDataMemoryModeHeap;
  ip.rawdataOpts.shareRawdataMemoryMode=ZoomSDKRawDataMemoryModeHeap;
  if(InitSDK(ip)!=SDKERR_SUCCESS){ printf("INIT-FAIL\n"); return 5; }
  printf("INIT-OK\n"); fflush(stdout);

  IAuthService* auth=nullptr;
  if(CreateAuthService(&auth)!=SDKERR_SUCCESS||!auth){ printf("AUTHSVC-FAIL\n"); return 6; }
  static AuthEvent ae;
  auth->SetEvent(&ae);
  AuthContext ctx;
  ctx.jwt_token=j;
  SDKError e=auth->SDKAuth(ctx);
  printf("SDKAUTH-CALL=%d\n",(int)e); fflush(stdout);

  loop=g_main_loop_new(NULL,FALSE);
  g_timeout_add_seconds(HARD_CAP_SECONDS,hard_timeout,NULL);
  g_main_loop_run(loop);
  CleanUPSDK();
  printf("EXIT=%d\n",g_exit); fflush(stdout);
  return g_exit;
}
