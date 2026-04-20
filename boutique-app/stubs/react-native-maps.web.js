/**
 * Web stub: react-native-maps is native-only. Metro resolves this instead of the real
 * package when platform === 'web' (see metro.config.js).
 */
const React = require('react');
const { View } = require('react-native');

function MapView({ style, children }) {
  return React.createElement(View, { style }, children);
}

function Marker() {
  return null;
}

module.exports = MapView;
module.exports.default = MapView;
module.exports.MapView = MapView;
module.exports.Marker = Marker;
module.exports.MapMarker = Marker;
module.exports.PROVIDER_GOOGLE = 'google';
module.exports.PROVIDER_DEFAULT = undefined;
