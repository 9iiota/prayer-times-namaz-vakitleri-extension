try
{
    const shadowHost = document.createElement("div");
    const shadowRoot = shadowHost.attachShadow({ mode: "open" });

    const saveButton = document.createElement("button");
    saveButton.textContent = "Save Location";
    saveButton.addEventListener("click", async () =>
    {
        try
        {
            const prayerTimesLink = window.location.href;
            const prayerSchedule = [];

            const response = await fetch(prayerTimesLink);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const htmlText = await response.text();

            const parser = new DOMParser();
            const doc = parser.parseFromString(htmlText, "text/html");

            const days = doc.querySelectorAll("#tab-1 > div > table > tbody > tr");
            days.forEach(day =>
            {
                const children = day.children;

                const dateStr = children[0].textContent.trim();
                const [d, m, y] = dateStr.split(".");
                const date = new Date(y, m - 1, d);

                const timeTds = Array.from(children).slice(2);
                const times = timeTds.map(cell => cell.textContent.trim());
                const prayerTimesObj = {
                    date: date.toISOString().split("T")[0],
                    times: times
                };

                prayerSchedule.push(prayerTimesObj);
            });

            chrome.storage.sync.set({ prayerTimesLink, prayerSchedule }, () =>
            {
                if (chrome.runtime.lastError)
                {
                    console.error("❌ Failed to save:", chrome.runtime.lastError);
                } else
                {
                    console.log("✅ Saved prayerTimesLink, prayerSchedule successfully!");
                }
            });
        }
        catch (error)
        {
            console.error("Failed to fetch namaz times:", error);
        }
    });
    shadowRoot.appendChild(saveButton);

    const rsRow = document.querySelector(".rs-row");
    if (rsRow)
    {
        rsRow.appendChild(shadowHost);
    }
} catch (err)
{
    console.error(err);
}