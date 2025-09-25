import * as utils from "./utils.js";

// Used to keep the service worker alive
chrome.alarms.create({ periodInMinutes: .4 })
chrome.alarms.onAlarm.addListener(() =>
{
    console.log('Keeping service worker alive...')
});

chrome.runtime.onInstalled.addListener(async () =>
{
    await utils.populateStorage();
    utils.startPrayerTimeBadgeTask();
});
chrome.runtime.onStartup.addListener(async () =>
{
    await utils.populateStorage();
    utils.startPrayerTimeBadgeTask();
});

