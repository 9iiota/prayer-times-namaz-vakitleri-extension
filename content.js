try
{
    const shadowHost = document.createElement("div");
    const shadowRoot = shadowHost.attachShadow({ mode: "open" });

    const saveButton = document.createElement("button");
    saveButton.textContent = "Save Location";
    saveButton.addEventListener("click", () =>
    {
        chrome.storage.sync.set({ prayerTimesLink: window.location.href }, () =>
        {
            if (chrome.runtime.lastError)
            {
                console.error("❌ Failed to save:", chrome.runtime.lastError);
            } else
            {
                console.log("✅ Saved prayerTimesLink successfully!");
            }
        });
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