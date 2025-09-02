document.addEventListener("DOMContentLoaded", () =>
{
    chrome.storage.sync.get("prayerTimesLink", (data) =>
    {
        const prayerTimesLink =
            data.prayerTimesLink ||
            "https://namazvakitleri.diyanet.gov.tr/en-US/9206"; // default link
    });

    const setLocationButton = document.createElement("button");
    setLocationButton.textContent = "Set Location";
    setLocationButton.addEventListener("click", () =>
    {
        chrome.runtime.sendMessage({ action: "openLocationPage" });
    });
    document.body.appendChild(setLocationButton);

    const button = document.createElement("button");
    button.textContent = "Fetch Namaz Times";
    button.addEventListener("click", async () =>
    {
        try
        {
            const response = await fetch("https://namazvakitleri.diyanet.gov.tr/tr-TR/13980");
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const htmlText = await response.text();

            // Parse HTML into DOM
            const parser = new DOMParser();
            const doc = parser.parseFromString(htmlText, "text/html");

            const days = document.querySelectorAll("#tab-1 > div > table > tbody > tr");
            days.forEach(day =>
            {
                const children = day.children;

                const dateStr = children[0].textContent.trim();
                const [dayStr, month, year] = dateStr.split(".");
                const date = new Date(year, month - 1, dayStr);

                // Convert children to an array and slice from index 2
                const prayerTimes = Array.from(children).slice(2);

                console.log(`Date: ${date.toISOString().split("T")[0]}`);
                prayerTimes.forEach((cell, i) =>
                {
                    console.log(`\tPrayer ${i + 1}:`, cell.textContent.trim());
                });
            });

            // const prayerElements = doc.querySelector("#tab-0 > div > table > tbody");
            // if (!prayerElements) throw new Error("Failed to find prayer elements in the HTML");

            // const weeklySchedule = [];

            // const today = new Date();
            // for (let i = 0; i < prayerElements.children.length; i++)
            // {
            //     const date = new Date(today);
            //     date.setDate(today.getDate() + i);

            //     const formattedDate = date.toISOString().split("T")[0];
            //     const dailySchedule = createEmptyDailySchedule(formattedDate);

            //     const prayers = [];

            //     const row = prayerElements.children[i];
            //     for (let j = 2; j < row.children.length; j++)
            //     {
            //         const prayerTime = row.children[j].textContent.trim();
            //         if (prayerTime)
            //         {
            //             prayers.push(new PrayerTime(`Prayer ${j - 1}`, prayerTime));
            //         }
            //     }

            //     weeklySchedule.push(DailyPrayerSchedule.fromObject(dailySchedule));
            // }

            // localStorage.setItem("weeklyPrayerSchedule", JSON.stringify(weeklySchedule));
        }
        catch (error)
        {
            console.error("Failed to fetch namaz times:", error);
        }
    });
    document.body.appendChild(button);

    // const localWeeklySchedule = JSON.parse(localStorage.getItem("weeklyPrayerSchedule"));

    // const container = document.querySelector(".container");
    // const totalPrayers = 6;
    // const currentPrayerIndex = 0;

    // const today = new Date();
    // const dateStr = today.toISOString().split("T")[0];
    // const dailySchedule = localWeeklySchedule.find(schedule => schedule.date === dateStr);

    // const currentTime = getCurrentTime();
    // const currentPrayerTime = dailySchedule.prayers[currentPrayerIndex].time;
    // const timeUntilNextPrayer = getTimeDifference(currentTime, currentPrayerTime);
    // const div = document.createElement("div");
    // div.className = "stacked";
    // div.textContent = `Time until next prayer: ${timeUntilNextPrayer}`;
    // container.appendChild(div);

    // for (let i = 0; i < totalPrayers; i++)
    // {
    //     const { name, time } = dailySchedule.prayers[i];

    //     const div = document.createElement("div");
    //     div.className = "stacked";
    //     div.style.width = `${100 - Math.abs(currentPrayerIndex - i) * 10}%`;

    //     const nameSpan = document.createElement("span");
    //     nameSpan.textContent = name;

    //     const timeSpan = document.createElement("span");
    //     timeSpan.textContent = time;

    //     div.appendChild(nameSpan);
    //     div.appendChild(timeSpan);

    //     if (i === currentPrayerIndex)
    //     {
    //         div.id = "current-prayer";
    //         div.addEventListener("click", () =>
    //         {
    //             // Toggle background color on click
    //             div.style.backgroundColor = div.style.backgroundColor === "rgb(173, 216, 230)" ? "#d3d3d3" : "#add8e6ff";
    //         });
    //     }
    //     else
    //     {
    //         div.style.filter = `brightness(${100 - Math.abs(currentPrayerIndex - i) * 5}%)`; // Decrease brightness based on distance from current prayer
    //     }

    //     container.appendChild(div);
    // }
});

class PrayerTime
{
    constructor(name, time)
    {
        this.name = name;
        this.time = time; // Expected format: "HH:MM"
    }

    static fromObject(obj)
    {
        return new PrayerTime(obj.name, obj.time);
    }
}

class DailyPrayerSchedule
{
    constructor(date, prayers = [])
    {
        this.date = date; // Format: "YYYY-MM-DD"
        this.prayers = prayers; // Array of PrayerTime objects
    }

    static fromObject(obj)
    {
        const prayers = obj.prayers.map(PrayerTime.fromObject);
        return new DailyPrayerSchedule(obj.date, prayers);
    }
}

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