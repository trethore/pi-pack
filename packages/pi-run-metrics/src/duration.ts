const zero = 0;
const millisecondsPerSecond = 1000;
const secondsPerMinute = 60;
const secondsPerHour = 3600;

const Duration = {
	format(milliseconds: number): string {
		const totalSeconds = Math.floor(Math.max(zero, milliseconds) / millisecondsPerSecond);
		const seconds = totalSeconds % secondsPerMinute;
		const minutes = Math.floor(totalSeconds / secondsPerMinute) % secondsPerMinute;
		const hours = Math.floor(totalSeconds / secondsPerHour);
		if (hours > zero) {
			return `${hours}h${minutes}m${seconds}s`;
		}
		if (totalSeconds >= secondsPerMinute) {
			return `${minutes}m${seconds}s`;
		}
		return `${seconds}s`;
	},
};

export { Duration };
