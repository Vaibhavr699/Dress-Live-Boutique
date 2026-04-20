/**
 * Web stub: @livekit/react-native is native-only. Metro resolves this on platform === 'web'
 * so the browser bundle never executes the real package (avoids DOMException / WebRTC crashes).
 */
'use strict';

function noop() {}

function NullComponent() {
  return null;
}

exports.registerGlobals = noop;
exports.LiveKitRoom = NullComponent;
exports.useRoomContext = function useRoomContext() {
  return null;
};
exports.useTracks = function useTracks() {
  return [];
};
exports.VideoTrack = NullComponent;
exports.isTrackReference = function isTrackReference() {
  return false;
};
