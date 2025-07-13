document.addEventListener("DOMContentLoaded", async () =>
{
    const nextTimeDiv = document.getElementById("next-time");
    nextTimeDiv.addEventListener("click", () =>
    {
        nextTimeDiv.style.backgroundColor = nextTimeDiv.style.backgroundColor === "rgb(173, 216, 230)" ? "#f0f0f0" : "#add8e6ff";
    });

    const container = document.querySelector(".container");
    const totalPrayers = 7;
    const nextPrayerIndex = 4;

    for (let i = 0; i < totalPrayers - 1; i++)
    {
        const div = document.createElement("div");
        div.className = "stacked";
        div.textContent = `Prayer ${i + 1}`;
        const absoluteDiff = Math.abs(i - nextPrayerIndex);

        if (i < nextPrayerIndex)
        {
            div.style.width = `${45 - (absoluteDiff) * 5}vw`;
            div.style.top = `${50 - (absoluteDiff) * 6}vh`;
            container.insertBefore(div, nextTimeDiv);
        }
        else
        {
            div.style.width = `${45 - (absoluteDiff + 1) * 5}vw`;
            div.style.top = `${50 + (absoluteDiff + 1) * 6}vh`;
            container.appendChild(div);
        }
    }
});