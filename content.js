try
{
    const shadowHost = document.createElement("div");
    const shadowRoot = shadowHost.attachShadow({ mode: "open" });

    const button = document.createElement("button");
    button.textContent = "My Button";
    button.addEventListener("click", () =>
    {
        const selections = document.querySelectorAll(".select2-selection__rendered");
        const city = selections[selections.length - 1].textContent.trim();
        if (city)
        {
            const cityOptions = document.querySelector(".district-select.region-select.select2-hidden-accessible");
            const cityIdOption = Array.from(cityOptions.options).find(option => option.textContent.trim().toUpperCase() === city.toUpperCase());
            if (cityIdOption)
            {
                const cityId = cityIdOption.value;
                chrome.storage.sync.set({ cityId: cityId }, () =>
                {
                    if (chrome.runtime.lastError)
                    {
                        console.error("Error saving City ID:", chrome.runtime.lastError);
                    } else
                    {
                        console.log("City ID saved successfully:", cityId);
                    }
                });
            }
        }
    });
    shadowRoot.appendChild(button);

    const rsRow = document.querySelector(".rs-row");
    if (rsRow)
    {
        rsRow.appendChild(shadowHost);
    }
} catch (err)
{
    console.error(err);
}