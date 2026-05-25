// Shared in-memory token store for Fitbit OAuth tokens
// Used by both fitbitAuthCallback and fitbitRefreshData routes

let accessToken = "";
let refreshToken = "";
let tokenExpirationTime = 0;

module.exports = {
  getAccessToken() {
    return accessToken;
  },
  getRefreshToken() {
    return refreshToken;
  },
  setTokens(access, refresh, expiration) {
    accessToken = access;
    refreshToken = refresh;
    tokenExpirationTime = expiration;
  },
  isExpired() {
    return !tokenExpirationTime || tokenExpirationTime <= Date.now();
  },
};
