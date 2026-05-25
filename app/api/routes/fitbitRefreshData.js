var express = require("express");
var axios = require("axios");
const fs = require("fs");
const path = require("path");
var router = express.Router();

const client_secret = process.env.FITBIT_CLIENT_SECRET;
const client_id = process.env.FITBIT_CLIENT_ID;
const encodedClientIDAndSecret = btoa(client_id + ":" + client_secret);

// Shared token state - imported from fitbitAuthCallback via app-level storage
// We'll use a simple shared module for token persistence
const tokenStore = require("../tokenStore");

function calculateExpirationTimeOfAccessToken(secondsFromNow) {
  const now = new Date();
  return now.setSeconds(now.getSeconds() + secondsFromNow);
}

async function refreshAccessToken() {
  const currentRefreshToken = tokenStore.getRefreshToken();
  if (!currentRefreshToken) {
    throw new Error("No refresh token available. Please login to Fitbit first.");
  }

  const postData = {
    refresh_token: currentRefreshToken,
    grant_type: "refresh_token",
  };

  const headers = {
    Authorization: "Basic " + encodedClientIDAndSecret,
    "Content-Type": "application/x-www-form-urlencoded",
  };

  const response = await axios.post(
    "https://api.fitbit.com/oauth2/token",
    postData,
    { headers }
  );

  tokenStore.setTokens(
    response.data.access_token,
    response.data.refresh_token,
    calculateExpirationTimeOfAccessToken(response.data.expires_in)
  );

  return response.data.access_token;
}

async function fetchFitbitActivities(accessToken) {
  const date = new Date();
  const currentDay = String(date.getDate()).padStart(2, "0");
  const currentMonth = String(date.getMonth() + 1).padStart(2, "0");
  const currentYear = date.getFullYear();

  const endpointUrl = `https://api.fitbit.com/1/user/-/activities/list.json?beforeDate=${currentYear}-${currentMonth}-${currentDay}&sort=desc&offset=0&limit=15`;

  const response = await axios.get(endpointUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (response.data.activities && Array.isArray(response.data.activities)) {
    const filteredActivities = response.data.activities.filter(
      (activity) => activity.activityName === "Weights"
    );

    const filePath = path.join(__dirname, "fitbitData.json");
    fs.writeFileSync(filePath, JSON.stringify(filteredActivities));
    console.log("Fitbit data refreshed successfully.");
    return filteredActivities;
  }

  return [];
}

/* GET /fitbitRefreshData - refresh Fitbit data using stored tokens */
router.get("/", async (req, res) => {
  try {
    let accessToken = tokenStore.getAccessToken();

    // If no access token or it's expired, try to refresh
    if (!accessToken || tokenStore.isExpired()) {
      accessToken = await refreshAccessToken();
    }

    const activities = await fetchFitbitActivities(accessToken);
    res.json({ success: true, count: activities.length, lastSync: new Date().toISOString() });
  } catch (error) {
    console.error("Error refreshing Fitbit data:", error.message);

    // If token refresh failed, try once more with a fresh refresh
    if (error.response && error.response.status === 401) {
      try {
        const accessToken = await refreshAccessToken();
        const activities = await fetchFitbitActivities(accessToken);
        res.json({ success: true, count: activities.length, lastSync: new Date().toISOString() });
        return;
      } catch (retryError) {
        // Fall through to error response
      }
    }

    res.status(error.message.includes("No refresh token") ? 401 : 500).json({
      success: false,
      error: error.message.includes("No refresh token")
        ? "not_authenticated"
        : "refresh_failed",
      message: error.message,
    });
  }
});

module.exports = router;
