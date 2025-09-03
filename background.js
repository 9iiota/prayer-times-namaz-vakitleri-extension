chrome.runtime.onMessage.addListener((msg, sender, sendResponse) =>
{
    if (msg.action === "openPrayerTimesLink")
    {
        chrome.storage.sync.get("prayerTimesLink", (data) =>
        {
            const prayerTimesLink = data.prayerTimesLink || "https://namazvakitleri.diyanet.gov.tr/en-US/9206";

            chrome.tabs.create({ url: prayerTimesLink }, (tab) =>
            {
                chrome.tabs.onUpdated.addListener(function listener(tabId, info)
                {
                    if (tabId === tab.id && info.status === "complete")
                    {
                        chrome.tabs.sendMessage(tab.id, { action: "createButton" });
                        chrome.tabs.onUpdated.removeListener(listener);
                    }
                });
            });
        });
    }
});
