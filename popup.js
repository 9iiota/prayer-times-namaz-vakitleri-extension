document.addEventListener("DOMContentLoaded", async () =>
{
    const prayerTimes = document.querySelector(".prayer-times");

    for (let i = 0; i < 5; i++)
    {
        const li = document.createElement("li");

        const span = document.createElement("span");
        span.textContent = `Item ${i + 1}`;
        li.appendChild(span);

        const distanceFromNext = Math.abs(i - 2);
        li.classList.add(`distance-${distanceFromNext}`);

        if (i === 2)
        {
            li.id = "next-time";
            li.addEventListener("click", () =>
            {
                li.classList.toggle("prayed");
            });
        }

        prayerTimes.appendChild(li);
    }
});
