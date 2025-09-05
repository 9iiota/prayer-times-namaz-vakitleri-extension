// TODO: ALLES ZELFDE WIDTH BEHALVE CURRENT DIE IS THICKER

const PRAYER_NAMES = ["Fajr", "Sun", "Dhuhr", "Asr", "Maghrib", "Isha"];
const PRAYER_GRADIENTS = {
    Fajr: "linear-gradient(180deg, #d93f03, #fbdf40)",      // deep night → dawn glow
    Sun: "linear-gradient(180deg, #fbdf40, #ccc900ff)",       // golden sunrise
    Dhuhr: "linear-gradient(180deg, hsla(59, 100%, 40%, 1.00), #ccc900ff)",     // bright midday sky
    Asr: "linear-gradient(180deg, #ccc900ff, #243b55)",       // warm late afternoon
    Maghrib: "linear-gradient(180deg, #243b55, #141e30)",   // pink-orange sunset
    Isha: "linear-gradient(180deg, #141e30 45%, #d93f03 100%)"       // dark night blue
};

document.addEventListener("DOMContentLoaded", () =>
{
    chrome.storage.sync.get(["prayerTimesLink", "prayerSchedule"], (storage) =>
    {
        const prayerTimesLink = storage.prayerTimesLink || "https://namazvakitleri.diyanet.gov.tr/en-US/9206";
        const prayerSchedule = storage.prayerSchedule;

        // const setLocationButton = document.createElement("button");
        // setLocationButton.textContent = "Set Location";
        // setLocationButton.addEventListener("click", () =>
        // {
        //     chrome.runtime.sendMessage({ action: "openPrayerTimesLink" });
        // });
        // document.body.appendChild(setLocationButton);

        // const fetchNamazTimesButton = document.createElement("button");
        // fetchNamazTimesButton.textContent = "Fetch Namaz Times";
        // fetchNamazTimesButton.addEventListener("click", async () =>
        // {
        //     try
        //     {
        //         const prayerSchedule = [];

        //         const response = await fetch(prayerTimesLink);
        //         if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        //         const htmlText = await response.text();

        //         const parser = new DOMParser();
        //         const doc = parser.parseFromString(htmlText, "text/html");

        //         const days = doc.querySelectorAll("#tab-1 > div > table > tbody > tr");
        //         days.forEach(day =>
        //         {
        //             const children = day.children;

        //             const dateStr = children[0].textContent.trim();
        //             const [d, m, y] = dateStr.split(".");
        //             const date = new Date(y, m - 1, d);

        //             const timeTds = Array.from(children).slice(2);
        //             const times = timeTds.map(cell => cell.textContent.trim());
        //             const prayerTimesObj = {
        //                 date: date.toISOString().split("T")[0],
        //                 times: times
        //             };

        //             prayerSchedule.push(prayerTimesObj);
        //         });

        //         chrome.storage.sync.set({ prayerSchedule }, () =>
        //         {
        //             if (chrome.runtime.lastError)
        //             {
        //                 console.error("❌ Failed to save:", chrome.runtime.lastError);
        //             } else
        //             {
        //                 console.log("✅ Saved prayerSchedule successfully!");
        //             }
        //         });
        //     }
        //     catch (error)
        //     {
        //         console.error("Failed to fetch namaz times:", error);
        //     }
        // });
        // document.body.appendChild(fetchNamazTimesButton);

        // const logPrayerTimesButton = document.createElement("button");
        // logPrayerTimesButton.textContent = "Log Prayer Times";
        // logPrayerTimesButton.addEventListener("click", () =>
        // {
        //     chrome.storage.sync.get("prayerSchedule", (data) =>
        //     {
        //         const prayerSchedule = data.prayerSchedule;
        //         console.log(prayerSchedule);
        //     });
        // });
        // document.body.appendChild(logPrayerTimesButton);

        const container = document.querySelector(".container");

        const today = new Date();
        const dateStr = today.toISOString().split("T")[0];
        const dailySchedule = prayerSchedule.find(schedule => schedule.date === dateStr);

        const passedTimes = dailySchedule.times.filter(time => time <= getCurrentTime());
        const currentPrayerTime = passedTimes[passedTimes.length - 1];
        const currentPrayerIndex = dailySchedule.times.indexOf(currentPrayerTime);

        // const currentTime = getCurrentTime();

        // // To calculate time until next prayer, find the next time in the list
        // // Get smallest time that is greater than current time
        // // If none, take the first time of the next day
        // let nextPrayerTime = dailySchedule.times.find(time => time > currentTime);
        // if (!nextPrayerTime)
        // {
        //     nextPrayerTime = prayerSchedule.find(schedule => schedule.date > dateStr)?.times[0] || dailySchedule.times[0];
        // }
        // const timeUntilNextPrayer = getTimeDifference(currentTime, nextPrayerTime);
        // const div = document.createElement("div");
        // div.className = "stacked";
        // div.textContent = timeUntilNextPrayer;
        // container.appendChild(div);

        for (let i = 0; i < PRAYER_NAMES.length; i++)
        {
            const name = PRAYER_NAMES[i];
            const time = dailySchedule.times[i];

            const div = document.createElement("div");
            div.className = "stacked";
            // div.style.width = `${100 - Math.abs(currentPrayerIndex - i) * 10}%`;
            div.style.background = PRAYER_GRADIENTS[name];

            const nameSpan = document.createElement("span");
            nameSpan.textContent = name;

            const timeSpan = document.createElement("span");
            timeSpan.textContent = time;

            div.appendChild(nameSpan);
            div.appendChild(timeSpan);

            if (i === currentPrayerIndex)
            {
                div.id = "current-prayer";
                // div.addEventListener("click", () =>
                // {
                //     // Toggle background color on click
                //     div.style.backgroundColor = div.style.backgroundColor === "rgb(173, 216, 230)" ? "#d3d3d3" : "#add8e6ff";
                // });
            }
            // else
            // {
            //     div.style.filter = `brightness(${100 - Math.abs(currentPrayerIndex - i) * 5}%)`; // Decrease brightness based on distance from current prayer
            // }

            container.appendChild(div);
        }
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