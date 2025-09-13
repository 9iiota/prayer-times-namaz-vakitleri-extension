// TODO: ALLES ZELFDE WIDTH BEHALVE CURRENT DIE IS THICKER

const PRAYER_NAMES = ["Fajr", "Sun", "Dhuhr", "Asr", "Maghrib", "Isha"];

document.addEventListener("DOMContentLoaded", () =>
{
    chrome.storage.sync.get(["prayerTimesLink", "prayerSchedule", "location"], (storage) =>
    {
        const prayerTimesLink = storage.prayerTimesLink || "https://namazvakitleri.diyanet.gov.tr/en-US/9206";
        const prayerSchedule = storage.prayerSchedule;
        const location = storage.location;

        const prayerTimes = document.querySelector(".prayer-times");

        const today = new Date();
        const dateStr = today.toISOString().split("T")[0];
        const dailySchedule = prayerSchedule.find(schedule => schedule.date === dateStr);

        const passedTimes = dailySchedule.times.filter(time => time <= getCurrentTime());
        const currentPrayerTime = passedTimes[passedTimes.length - 1];
        const currentPrayerIndex = dailySchedule.times.indexOf(currentPrayerTime);

        for (let i = 0; i < PRAYER_NAMES.length; i++)
        {
            const name = PRAYER_NAMES[i];
            const time = dailySchedule.times[i];

            const div = document.createElement("div");
            div.className = "prayer";

            const nameSpan = document.createElement("span");
            nameSpan.textContent = name;
            nameSpan.className = "prayer-name";

            const timeSpan = document.createElement("span");
            timeSpan.textContent = time;
            timeSpan.className = "prayer-time";

            div.appendChild(nameSpan);
            div.appendChild(timeSpan);

            if (i === currentPrayerIndex)
            {
                div.id = "current-prayer";
                div.addEventListener("click", () =>
                {
                    if (div.classList.contains("prayed"))
                        div.classList.remove("prayed");
                    else
                        div.classList.add("prayed");
                });
            }

            prayerTimes.appendChild(div);
        }

        const container = document.querySelector(".container");
        container.style.width = container.offsetWidth + "px";


        // Setings button
        const settingsButton = document.querySelector(".settings-button");
        const overlay = document.querySelector(".overlay");
        const closeBtn = document.querySelector(".close");

        // Open popup
        settingsButton.addEventListener("click", () =>
        {
            overlay.classList.remove("hidden");
        });

        // Close when clicking close button
        closeBtn.addEventListener("click", () =>
        {
            overlay.classList.add("hidden");
        });

        // Close when clicking outside popup
        overlay.addEventListener("click", (e) =>
        {
            if (e.target === overlay)
            {
                overlay.classList.add("hidden");
            }
        });

        // Optional: Close with Escape key
        document.addEventListener("keydown", (e) =>
        {
            if (e.key === "Escape")
            {
                overlay.classList.add("hidden");
            }
        });

        const setLocationButton = document.querySelector("#setLocationButton");
        setLocationButton.textContent = location;
        setLocationButton.addEventListener("click", () =>
        {
            window.open(prayerTimesLink, "_blank");
        });
    });
});

function getCurrentTime()
{
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
}

function getTimeDifference(startTime, endTime)
{
    // Convert HH:MM to total minutes
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);

    const startTotal = startH * 60 + startM;
    const endTotal = endH * 60 + endM;

    let diff = endTotal - startTotal;

    // If the difference is negative, assume it's the next day
    if (diff < 0) diff += 24 * 60;

    const diffH = Math.floor(diff / 60);
    const diffM = diff % 60;

    // Pad with leading zero if needed
    const pad = n => n.toString().padStart(2, '0');

    return `${pad(diffH)}:${pad(diffM)}`;
}

function interpolateColor(color1, color2, factor)
{
    const c1 = color1.match(/\w\w/g).map(c => parseInt(c, 16));
    const c2 = color2.match(/\w\w/g).map(c => parseInt(c, 16));
    const result = c1.map((v, i) => Math.round(v + factor * (c2[i] - v)));
    return `#${result.map(v => v.toString(16).padStart(2, "0")).join("")}`;
}