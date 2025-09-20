import * as utils from "./utils.js";

let badgeText, badgeTextColor, badgeBackgroundColor;

chrome.runtime.onInstalled.addListener(test);
chrome.runtime.onStartup.addListener(test);

async function test()
{
    await utils.populateStorage();

    const storage = await utils.getFromStorage(["prayerTimes"]);
    const { prayerTimes } = storage;
    if (!prayerTimes || prayerTimes.length === 0) throw new Error("No prayer times found in storage");

    const now = new Date();
    const todayTimes = utils.getPrayerTimesByDate(prayerTimes, now);
    if (!todayTimes) throw new Error("No prayer times found for today");

    let nextPrayerIndex = utils.getCurrentPrayerIndex(todayTimes) + 1;
    if (nextPrayerIndex > 0)
    {
        let nextPrayerTime;
        if (nextPrayerIndex < todayTimes.times.length)
        {
            nextPrayerTime = todayTimes.times[nextPrayerIndex];
        }
        else
        {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            const tomorrowTimes = utils.getPrayerTimesByDate(prayerTimes, tomorrow);
            if (!tomorrowTimes) throw new Error("No prayer times found for tomorrow");
            nextPrayerIndex = 0;
            nextPrayerTime = tomorrowTimes.times[nextPrayerIndex];
        }

        const timeDifference = utils.getTimeDifference(utils.getCurrentTime(), nextPrayerTime);
        utils.setBadgeText(timeDifference);
        if (timeDifference.includes("m"))
        {
            // Less than an hour remaining
            const textColor = "#000000";
            if (badgeTextColor !== textColor)
            {
                utils.setBadgeTextColor(textColor);
                badgeTextColor = textColor;
            }

            const backgroundColor = "#ff0000ff";
            if (badgeBackgroundColor !== backgroundColor)
            {
                utils.setBadgeBackgroundColor(backgroundColor);
                badgeBackgroundColor = backgroundColor;
            }
        }
        else
        {
            // More than an hour remaining
            const textColor = "#ffffff";
            if (badgeTextColor !== textColor)
            {
                utils.setBadgeTextColor(textColor);
                badgeTextColor = textColor;
            }

            const backgroundColor = "#0000ffff";
            if (badgeBackgroundColor !== backgroundColor)
            {
                utils.setBadgeBackgroundColor(backgroundColor);
                badgeBackgroundColor = backgroundColor;
            }
        }
    }
}