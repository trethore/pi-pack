const ZERO = 0;
const MILLISECONDS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;
const HOUR_SUFFIX = "h";
const MINUTE_SUFFIX = "m";
const SECOND_SUFFIX = "s";

const Duration = {
	format(milliseconds: number): string {
		const totalSeconds = Math.floor(Math.max(ZERO, milliseconds) / MILLISECONDS_PER_SECOND);
		const seconds = totalSeconds % SECONDS_PER_MINUTE;
		const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE) % SECONDS_PER_MINUTE;
		const hours = Math.floor(totalSeconds / SECONDS_PER_HOUR);
		if (hours > ZERO) {
			return `${hours}${HOUR_SUFFIX}${minutes}${MINUTE_SUFFIX}${seconds}${SECOND_SUFFIX}`;
		}
		if (totalSeconds >= SECONDS_PER_MINUTE) {
			return `${minutes}${MINUTE_SUFFIX}${seconds}${SECOND_SUFFIX}`;
		}
		return `${seconds}${SECOND_SUFFIX}`;
	},
};

export { Duration };
