import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

export interface LogValue {
    t: string,
    v: number|null
}

export interface Log {
    updatesIn: number,
    values: LogValue[],
    start: string,
    end: string,
    step: number,
    uri: string,
    id: string,
    lastValue: LogValue
}

class LogNormaliser {
    public logs: Log;
    public resolution: string;
    public timezone: string;

    constructor(logs: Log, resolution: string, timezone: string) {
        this.logs = logs;
        this.resolution = resolution;
        this.timezone = timezone;
    }

    public getNormalisedLogs(): LogValue[] {
        let labelFormat = 'HH:MM';
        let loopFormat = 'YYYY-MM-DD HH:mm:ss';

        switch (this.resolution) {
            default:
            case 'lastHour':
            case 'last6Hours':
                loopFormat = 'YYYY-MM-DD HH:mm';
                labelFormat = 'HH:mm';
                break;
            case 'last24Hours':
            case 'yesterday':
            case 'today':
                loopFormat = 'YYYY-MM-DD HH';
                labelFormat = 'HH:00';
                break;
            case 'last14Days':
            case 'last31Days':
            case 'lastMonth':
            case 'thisMonth':
                loopFormat = 'YYYY-MM-DD';
                labelFormat = 'DD MMM';
                break;
            case 'last7Days':
            case 'thisWeek':
            case 'lastWeek':
                loopFormat = 'YYYY-MM-DD';
                labelFormat = 'ddd';
                break;
            case 'thisYear':
            case 'lastYear':
            case 'last2Years':
                loopFormat = 'YYYY-MM';
                labelFormat = 'MMM YYYY';
        }

        const combinedLogs = this.logs.values.reduce((acc: {[key: string]: LogValue[]}, log: LogValue) => {
            let date = dayjs(log.t);
            const dateFormatted = date.format(loopFormat);

            if (!acc[dateFormatted]) {
                acc[dateFormatted] = [];
            }

            acc[dateFormatted].push(log);
            return acc;
        }, {});

        // Get the highest values and format labels
        const values: LogValue[] = [];
        Object.keys(combinedLogs).forEach((key) => {
            const logs = combinedLogs[key];
            const highestLog = logs.reduce((acc: LogValue, log: LogValue) => {
                if ((log.v ?? 0) > (acc.v ?? 0)) {
                    return log;
                }

                return acc;
            }, {t: '', v: -999999});

            values.push({
                t: dayjs(highestLog.t).tz(this.timezone).format(labelFormat),
                v: highestLog.v
            });
        });

        return values;
    }
}

export default LogNormaliser;
