import * as utils from "./utils.js";

const DEFAULT_STORAGE_VALUES =
{
    parameters:
    {
        countryCode: null,
        postCode: null,
        latitude: null,
        longitude: null,
        methodId: 13,
        country: null,
        city: null
    },
};

chrome.runtime.onInstalled.addListener(populateStorage);
chrome.runtime.onStartup.addListener(populateStorage);

async function populateStorage()
{
    // chrome.storage.sync.clear();
    try
    {
        const keys = Object.keys(DEFAULT_STORAGE_VALUES);
        const storage = await utils.getFromStorage(keys);

        const toSet = {};
        for (const [key, defaultValue] of Object.entries(DEFAULT_STORAGE_VALUES))
        {
            if (storage[key] === undefined)
            {
                toSet[key] = defaultValue;
            }
        }

        if (Object.keys(toSet).length > 0)
        {
            await chrome.storage.sync.set(toSet);
            console.log("✅ Populated default storage values:", toSet);
        }
        else
        {
            console.log("ℹ️ Storage already initialized.");
        }
    }
    catch (err)
    {
        console.error("❌ Failed to populate storage:", err);
    }
}