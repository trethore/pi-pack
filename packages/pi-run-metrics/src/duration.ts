const zero = 0;
const millisecondsPerSecond = 1000;
const secondsPerMinute = 60;
const secondsPerHour = 3600;
const hourSuffix = "h";
const minuteSuffix = "m";
const secondSuffix = "s";

const Duration = {
	format(milliseconds: number): string {
		const totalSeconds = Math.floor(Math.max(zero, milliseconds) / millisecondsPerSecond);
		const seconds = totalSeconds % secondsPerMinute;
		const minutes = Math.floor(totalSeconds / secondsPerMinute) % secondsPerMinute;
		const hours = Math.floor(totalSeconds / secondsPerHour);
		if (hours > zero) {
			return `${hours}${hourSuffix}${minutes}${minuteSuffix}${seconds}${secondSuffix}`;
		}
		if (totalSeconds >= secondsPerMinute) {
			return `${minutes}${minuteSuffix}${seconds}${secondSuffix}`;
		}
		return `${seconds}${secondSuffix}`;
	},
};

export { Duration };
