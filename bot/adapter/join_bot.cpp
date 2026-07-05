#include <cstdio>
#include <cstdlib>
#include <cstring>
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
static int g_exit=3;
static gboolean do_leave(gpointer){ if(g_meeting) g_meeting->Leave(LEAVE_MEETING); return FALSE; }
class MeetEvent : public IMeetingServiceEvent {
public:
 void onMeetingStatusChanged(MeetingStatus status,int iResult) override {
  printf("MEETING-STATUS=%d result=%d\n",(int)status,iResult); fflush(stdout);
  if(status==MEETING_STATUS_INMEETING){
    printf("IN-MEETING-OK\n");
    g_exit=0;
    IMeetingRecordingController* rc=g_meeting->GetMeetingRecordingController();
    if(rc){ printf("CAN-RAW-RECORD=%d\n",(int)rc->CanStartRawRecording()); }
    fflush(stdout);
    g_timeout_add_seconds(20, do_leave, NULL);
  }
  if(status==MEETING_STATUS_FAILED){ g_exit=2; g_main_loop_quit(loop);}
  if(status==MEETING_STATUS_ENDED){ g_main_loop_quit(loop);}
 }
 void onMeetingStatisticsWarningNotification(StatisticsWarningType) override {}
 void onMeetingParameterNotification(const MeetingParameter*) override {}
 void onSuspendParticipantsActivities() override {}
 void onAICompanionActiveChangeNotice(bool) override {}
 void onMeetingTopicChanged(const zchar_t*) override {}
 void onMeetingFullToWatchLiveStream(const zchar_t*) override {}
 void onUserNetworkStatusChanged(MeetingComponentType, ConnectionQuality, unsigned int, bool) override {}
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
  jp.param.withoutloginuserJoin.userName="SMC Bot";
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
static gboolean hard_timeout(gpointer){ printf("HARD-TIMEOUT\n"); g_main_loop_quit(loop); return FALSE; }
int main(int argc,char** argv){
 if(argc<2){ fprintf(stderr,"usage: join_bot <meeting_number> [passcode]\n"); return 4; }
 g_mn=strtoull(argv[1],nullptr,10);
 if(argc>2) g_psw=argv[2];
 const char* j=getenv("SMC_ZOOM_JWT");
 if(!j||!*j){ fprintf(stderr,"NO-JWT\n"); return 4; }
 InitParam ip;
 ip.strWebDomain="https://zoom.us";
 ip.enableLogByDefault=true;
 ip.rawdataOpts.audioRawdataMemoryMode=ZoomSDKRawDataMemoryModeHeap;
 ip.rawdataOpts.videoRawdataMemoryMode=ZoomSDKRawDataMemoryModeHeap;
 ip.rawdataOpts.shareRawdataMemoryMode=ZoomSDKRawDataMemoryModeHeap;
 if(InitSDK(ip)!=SDKERR_SUCCESS){ printf("INIT-FAIL\n"); return 5; }
 printf("INIT-OK\n");
 IAuthService* auth=nullptr;
 if(CreateAuthService(&auth)!=SDKERR_SUCCESS||!auth){ printf("AUTHSVC-FAIL\n"); return 6; }
 static AuthEvent ae;
 auth->SetEvent(&ae);
 AuthContext ctx;
 ctx.jwt_token=j;
 SDKError e=auth->SDKAuth(ctx);
 printf("SDKAUTH-CALL=%d\n",(int)e); fflush(stdout);
 loop=g_main_loop_new(NULL,FALSE);
 g_timeout_add_seconds(120,hard_timeout,NULL);
 g_main_loop_run(loop);
 CleanUPSDK();
 printf("EXIT=%d\n",g_exit);
 return g_exit;
}
