const DEFAULT_STORAGE_VALUES =
{
    location: "Click to set location",
    parameters:
    {
        countryCode: null,
        postCode: null,
        latitude: null,
        longitude: null,
        methodId: 13
    },
};

chrome.runtime.onInstalled.addListener(populateStorage);
chrome.runtime.onStartup.addListener(populateStorage);

async function populateStorage()
{
    try
    {
        const keys = Object.keys(DEFAULT_STORAGE_VALUES);
        const storage = await chrome.storage.sync.get(keys);

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