import * as utils from "./utils.js";

const DEFAULT_STORAGE_VALUES = {
    locationData: null,
    prayerTimes: null,
    method: 13,
};

chrome.runtime.onInstalled.addListener(() =>
{
    // chrome.storage.sync.clear()
    populateStorage();
});

chrome.runtime.onStartup.addListener(() =>
{
    populateStorage();
});

// chrome.runtime.onMessage.addListener((msg, sender, sendResponse) =>
// {
//     if (msg.action === "openPrayerTimesLink")
//     {
//         chrome.storage.sync.get("prayerTimesLink", (storage) =>
//         {
//             const prayerTimesLink = storage.prayerTimesLink;
//             if (prayerTimesLink)
//             {
//                 chrome.tabs.create({ url: prayerTimesLink });
//             }
//         });
//     }
// });

function populateStorage()
{
    const defaultKeys = Object.keys(DEFAULT_STORAGE_VALUES);

    chrome.storage.sync.get(defaultKeys, async (storage) =>
    {
        if (chrome.runtime.lastError)
        {
            console.error("❌ Failed to get storage:", chrome.runtime.lastError);
            return;
        }

        const toSet = {};
        // let ip = null;
        // let locationData = null;

        // Check "method" default
        if (storage.method === undefined)
        {
            toSet.method = DEFAULT_STORAGE_VALUES.method;
        }

        // Check "prayerTimes" default
        if (!storage.prayerTimes)
        {
            if (!storage.locationData) return; // location is required to fetch prayer times

            try
            {
                if (!ip)
                {
                    ip = await utils.getPublicIP();
                    locationData = await utils.getLocationData(ip);
                }

                const prayerTimes = await utils.getPrayerTimes(
                    ip,
                    locationData.latitude,
                    locationData.longitude,
                    storage.method || DEFAULT_STORAGE_VALUES.method
                );

                toSet.prayerTimes = prayerTimes;
            }
            catch (err)
            {
                console.error("❌ Failed to fetch prayer times:", err);
            }
        }

        if (Object.keys(toSet).length > 0)
        {
            chrome.storage.sync.set(toSet, () =>
            {
                if (chrome.runtime.lastError)
                {
                    console.error("❌ Failed to set default values:", chrome.runtime.lastError);
                } else
                {
                    console.log("✅ Populated default storage values:", toSet);
                }
            });
        }
    });
}