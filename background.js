/**
 * Background Service Worker
 * Handles periodic sync and notifications
 */

function getNextMidnight() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return midnight.getTime();
}

function ensureDailyResetAlarm() {
  // If alarms permission is missing, chrome.alarms will be undefined.
  if (!chrome.alarms) {
    console.error(
      "chrome.alarms is unavailable. Add the 'alarms' permission to manifest.json and reload the extension."
    );
    return;
  }

  // Clear then recreate to keep it clean across reloads/updates
  chrome.alarms.clear("dailyReset", () => {
    chrome.alarms.create("dailyReset", {
      when: getNextMidnight(),
      periodInMinutes: 24 * 60,
    });
    console.log("Daily reset alarm scheduled");
  });
}

// Listen for install/update
chrome.runtime.onInstalled.addListener((details) => {
  console.log("Extension installed/updated:", details.reason);

  if (details.reason === "install") {
    console.log("Job Confidence Tracker installed!");

    // Initialize storage
    chrome.storage.local.set({
      myReports: {},
      lastReportDate: new Date().toDateString(),
      reportsToday: 0,
    });
  }

  ensureDailyResetAlarm();
});

// Ensure alarm exists when Chrome starts (MV3 service worker can be suspended)
chrome.runtime.onStartup.addListener(() => {
  ensureDailyResetAlarm();
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === "GET_STATE") {
    chrome.storage.local.get(null, (data) => {
      sendResponse(data);
    });
    return true; // keep the channel open for async response
  }
});

// Alarm handler
chrome.alarms?.onAlarm.addListener((alarm) => {
  if (alarm.name === "dailyReset") {
    chrome.storage.local.set({
      lastReportDate: new Date().toDateString(),
      reportsToday: 0,
    });
    console.log("Daily report counter reset");
  }
});
