
![forum_banner](https://us1.discourse-cdn.com/flex025/uploads/athom/original/3X/4/8/4808cd2d5f59e3bbc5d33c5287bcf3dfd17f41dc.jpeg)


Insights Graphs for Homey

This app allows you to export any Homey Insights data into beautiful graphs.
Exports can be easily scheduled by using the trigger card in a flow. You can schedule by day or week or with time window you need.

Use ⚙
- Install this app on your Homey.
- Start creating flows

Current features 🔧
- [x] Color picker foor graphs in trigger card
- [x] Select a time window (day, week, month, etc..)

### Graph actions

The existing **create graph image** action keeps its original defaults. Its optional time-label and single-Insight reduction settings can be left empty to retain existing behavior.

The **advanced - create graph image** action also allows colors for Insights 2–4, a graph title, image width and height, and Y-axis minimum and maximum. Leave a field empty to use the default. Custom Y-axis limits require all displayed Insights to have the same unit. Width and height are chart dimensions before the renderer's pixel ratio is applied.

Both actions support automatic, hourly or two-hourly time labels. Select automatic labels if the chosen interval would produce more than 13 labels. Single-Insight reduction offers maximum, minimum and average when more than 250 points are returned; the first and last readings are retained. The original reduction remains the default. If an Insight cannot be read or has no data, its name is shown in the image subtitle when another Insight is available.

Graphs are rendered through QuickChart, so generating an image sends the chart data to that service.


Supported languages :netherlands:
:uk: English :netherlands: Dutch :de: German :fr: french :it: Italian :sweden: Swedish :norway: Norwegian :es: Spanish :denmark: Danish :ru: Russian :poland: Polish
