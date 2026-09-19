const { withInfoPlist } = require('expo/config-plugins');
module.exports = function withLocalPrivacy(config) {
  return withInfoPlist(config, next => {
    next.modResults.UIFileSharingEnabled = false;
    next.modResults.LSSupportsOpeningDocumentsInPlace = false;
    next.modResults.NSAppTransportSecurity = {
      NSAllowsArbitraryLoads: false,
      NSAllowsLocalNetworking: process.env.SNSG_DEVELOPMENT_NETWORK === '1',
    };
    return next;
  });
};
