const DEFAULT_STORAGE_VALUES =
{
    prayerTimesLink: "https://namazvakitleri.diyanet.gov.tr/en-US/9206",
    prayerSchedule: []
};

chrome.runtime.onInstalled.addListener(() =>
{
    populateStorageDefaults();
});

chrome.runtime.onStartup.addListener(() =>
{
    populateStorageDefaults();
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) =>
{
    if (msg.action === "openPrayerTimesLink")
    {
        chrome.storage.sync.get("prayerTimesLink", (storage) =>
        {
            const prayerTimesLink = storage.prayerTimesLink;
            chrome.tabs.create({ url: prayerTimesLink }, (tab) => { });
        });
    }
});

function populateStorageDefaults()
{
    const defaultKeys = Object.keys(DEFAULT_STORAGE_VALUES);

    // Fetch the values from storage for only the keys we care about.
    chrome.storage.sync.get(defaultKeys, (storage) =>
    {
        if (chrome.runtime.lastError)
        {
            console.error("❌ Failed to get storage:", chrome.runtime.lastError);
            return;
        }

        const toSet = {};
        for (const key of defaultKeys)
        {
            // Check if the value is missing in storage.
            if (storage[key] === undefined)
            {
                toSet[key] = defaultStorageValues[key];
            }
        }

        // Only set values if there are any missing defaults.
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