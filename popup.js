document.addEventListener("DOMContentLoaded", async () =>
{
    // fetch(`https://namazvakitleri.diyanet.gov.tr/tr-TR/13980`)
    //     .then(response => response.text())
    //     .then(data =>
    //     {
    //         console.log(data);
    //         // const matches = [...data.matchAll(NAMAZ_TIME_REGEX)];
    //         // if (matches.length !== 6)
    //         // {
    //         //     throw new Error('Failed to match namaz times due to an invalid city code');
    //         // }

    //         // const nextImsakTime = data.match(NEXT_IMSAK_TIME_REGEX)[1];
    //         // let namazTimesFormatted = matches.map(match => match[1]);
    //         // namazTimesFormatted.push(nextImsakTime);

    //         // callback(namazTimesFormatted);
    //     })
    //     .catch(() =>
    //     {
    //         throw new Error('Failed to fetch namaz times');
    //     });

    const nextTimeDiv = document.getElementById("next-time");
    nextTimeDiv.addEventListener("click", () =>
    {
        nextTimeDiv.style.backgroundColor = nextTimeDiv.style.backgroundColor === "rgb(173, 216, 230)" ? "#f4dfb4" : "#add8e6ff";
    });

    const container = document.querySelector(".container");
    const totalPrayers = 7;
    const nextPrayerIndex = 7;

    for (let i = 0; i < totalPrayers - 1; i++)
    {
        const absoluteDiff = i < nextPrayerIndex ? nextPrayerIndex - i : i - nextPrayerIndex + 1;
        const div = document.createElement("div");
        div.className = "stacked";
        div.textContent = `Prayer ${i + 1}`;
        div.style.width = `${75 - absoluteDiff * 7}vw`;
        div.style.filter = `brightness(${100 - absoluteDiff * 10}%)`;

        if (i < nextPrayerIndex)
        {
            div.style.top = `${50 - absoluteDiff * 5}%`;
            container.insertBefore(div, nextTimeDiv);
        }
        else
        {
            div.style.top = `${50 + absoluteDiff * 5}vh`;
            container.appendChild(div);
        }
    }
});