// Provenance values for participant audio frames. This is the WIRE CONTRACT
// shared with the engine (worker/src/bot-ingest.js → PROVENANCE). The two copies
// must stay in agreement; they are kept separate so the bot runtime stays an
// isolated package with no dependency on the engine bundle.
//
// 'synthetic' is the only value this increment ever produces or processes.
export const PROVENANCE = Object.freeze({
  SYNTHETIC: 'synthetic',
  ZOOM_MEETING_SDK: 'zoom-meeting-sdk',
  TEAMS: 'teams',
  MEET: 'meet',
});
