export type SectorRow = {
	sector: string;
	date: string;
	ticker: string;
	flow1dUsd: number | null;
	flow5dUsd: number | null;
	flow20dUsd: number | null;
	flow60dUsd: number | null;
	flow252dUsd: number | null;
	flow1dPctAum: number | null;
	flow5dPctAum: number | null;
	flow20dPctAum: number | null;
	flow60dPctAum: number | null;
	flow252dPctAum: number | null;
	flowScore: number | null;
	dcaScore: number | null;
	state: string | null;
	rank: number | null;
	rankChange: number | null;
};

export type Signal = {
	id: number;
	date: string;
	sector: string | null;
	type: string;
	title: string;
	message: string;
	severity: string;
};

export type DashboardData = {
	date: string | null;
	latestJob: {
		status: string;
		finishedAt: string | null;
		message: string | null;
	} | null;
	sectors: SectorRow[];
	signals: Signal[];
};

export type HistoryRow = SectorRow & {
	closePrice: number | null;
	flowUsd: number | null;
	relativeReturn60d: number | null;
};
