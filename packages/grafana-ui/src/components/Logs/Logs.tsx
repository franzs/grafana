import _ from 'lodash';
import React, { PureComponent } from 'react';

import {
  rangeUtil,
  RawTimeRange,
  LogLevel,
  TimeZone,
  AbsoluteTimeRange,
  LogsMetaKind,
  LogsModel,
  LogsDedupStrategy,
  LogRowModel,
} from '@grafana/data';
import { LogLabels } from './LogLabels';
import { ExploreGraphPanel } from './ExploreGraphPanel';
import { LogRow } from './LogRow';

const PREVIEW_LIMIT = 100;

function renderMetaItem(value: any, kind: LogsMetaKind) {
  if (kind === LogsMetaKind.LabelsMap) {
    return (
      <span className="logs-meta-item__labels">
        <LogLabels labels={value} plain getRows={() => []} />
      </span>
    );
  }
  return value;
}

interface Props {
  data?: LogsModel;
  dedupedData?: LogsModel;
  width: number;
  exploreId: string;
  highlighterExpressions: string[];
  loading: boolean;
  absoluteRange: AbsoluteTimeRange;
  timeZone: TimeZone;
  scanning?: boolean;
  scanRange?: RawTimeRange;
  dedupStrategy: LogsDedupStrategy;
  hiddenLogLevels: Set<LogLevel>;
  onChangeTime: (range: AbsoluteTimeRange) => void;
  onClickLabel?: (label: string, value: string) => void;
  onStartScanning?: () => void;
  onStopScanning?: () => void;
  onDedupStrategyChange: (dedupStrategy: LogsDedupStrategy) => void;
  onToggleLogLevel: (hiddenLogLevels: LogLevel[]) => void;
  getRowContext?: (row: LogRowModel, options?: any) => Promise<any>;
}

interface State {
  deferLogs: boolean;
  renderAll: boolean;
  showLabels: boolean;
  showTime: boolean;
}

export default class Logs extends PureComponent<Props, State> {
  deferLogsTimer: NodeJS.Timer | null = null;
  renderAllTimer: NodeJS.Timer | null = null;

  state = {
    deferLogs: true,
    renderAll: false,
    showLabels: false,
    showTime: true,
  };

  componentDidMount() {
    // Staged rendering
    if (this.state.deferLogs) {
      const { data } = this.props;
      const rowCount = data && data.rows ? data.rows.length : 0;
      // Render all right away if not too far over the limit
      const renderAll = rowCount <= PREVIEW_LIMIT * 2;
      this.deferLogsTimer = setTimeout(() => this.setState({ deferLogs: false, renderAll }), rowCount);
    }
  }

  componentDidUpdate(prevProps: Props, prevState: State) {
    // Staged rendering
    if (prevState.deferLogs && !this.state.deferLogs && !this.state.renderAll) {
      this.renderAllTimer = setTimeout(() => this.setState({ renderAll: true }), 2000);
    }
  }

  componentWillUnmount() {
    if (this.deferLogsTimer) {
      clearTimeout(this.deferLogsTimer);
    }

    if (this.renderAllTimer) {
      clearTimeout(this.renderAllTimer);
    }
  }

  onChangeDedup = (dedup: LogsDedupStrategy) => {
    const { onDedupStrategyChange } = this.props;
    if (this.props.dedupStrategy === dedup) {
      return onDedupStrategyChange(LogsDedupStrategy.none);
    }
    return onDedupStrategyChange(dedup);
  };

  onChangeLabels = (event: React.SyntheticEvent) => {
    const target = event.target as HTMLInputElement;
    this.setState({
      showLabels: target.checked,
    });
  };

  onChangeTime = (event: React.SyntheticEvent) => {
    const target = event.target as HTMLInputElement;
    this.setState({
      showTime: target.checked,
    });
  };

  onToggleLogLevel = (hiddenRawLevels: string[]) => {
    const hiddenLogLevels: LogLevel[] = hiddenRawLevels.map(level => LogLevel[level as LogLevel]);
    this.props.onToggleLogLevel(hiddenLogLevels);
  };

  onClickScan = (event: React.SyntheticEvent) => {
    event.preventDefault();
    if (this.props.onStartScanning) {
      this.props.onStartScanning();
    }
  };

  onClickStopScan = (event: React.SyntheticEvent) => {
    event.preventDefault();
    if (this.props.onStopScanning) {
      this.props.onStopScanning();
    }
  };

  render() {
    const {
      data,
      highlighterExpressions,
      loading = false,
      onClickLabel,
      timeZone,
      scanning,
      scanRange,
      width,
      dedupedData,
      absoluteRange,
      onChangeTime,
    } = this.props;

    if (!data) {
      return null;
    }

    const { deferLogs, renderAll, showLabels, showTime } = this.state;
    const { dedupStrategy } = this.props;
    const hasData = data && data.rows && data.rows.length > 0;
    const hasLabel = hasData && dedupedData && dedupedData.hasUniqueLabels ? true : false;
    const dedupCount = dedupedData
      ? dedupedData.rows.reduce((sum, row) => (row.duplicates ? sum + row.duplicates : sum), 0)
      : 0;
    const showDuplicates = dedupStrategy !== LogsDedupStrategy.none && dedupCount > 0;
    const meta = data.meta ? [...data.meta] : [];

    if (dedupStrategy !== LogsDedupStrategy.none) {
      meta.push({
        label: 'Dedup count',
        value: dedupCount,
        kind: LogsMetaKind.Number,
      });
    }

    // Staged rendering
    const processedRows = dedupedData ? dedupedData.rows : [];
    const firstRows = processedRows.slice(0, PREVIEW_LIMIT);
    const lastRows = processedRows.slice(PREVIEW_LIMIT);
    const scanText = scanRange ? `Scanning ${rangeUtil.describeTimeRange(scanRange)}` : 'Scanning...';
    const series = data && data.series ? data.series : [];

    // React profiler becomes unusable if we pass all rows to all rows and their labels, using getter instead
    const getRows = () => processedRows;
    const getRowContext = this.props.getRowContext ? this.props.getRowContext : () => Promise.resolve([]);

    return (
      <div className="logs-panel">
        <div className="logs-panel-graph">
          <ExploreGraphPanel
            series={series}
            width={width}
            onHiddenSeriesChanged={this.onToggleLogLevel}
            loading={loading}
            absoluteRange={absoluteRange}
            isStacked={true}
            showPanel={false}
            showingGraph={true}
            showingTable={true}
            timeZone={timeZone}
            showBars={true}
            showLines={false}
            onUpdateTimeRange={onChangeTime}
          />
        </div>
        {/* <div className="logs-panel-options">
          <div className="logs-panel-controls">
            <Switch label="Time" checked={showTime} onChange={this.onChangeTime} transparent />
            <Switch label="Labels" checked={showLabels} onChange={this.onChangeLabels} transparent />
            <ToggleButtonGroup label="Dedup" transparent={true}>
              {Object.keys(LogsDedupStrategy).map((dedupType: string, i) => (
                <ToggleButton
                  key={i}
                  value={dedupType}
                  onChange={this.onChangeDedup}
                  selected={dedupStrategy === dedupType}
                  // @ts-ignore
                  tooltip={LogsDedupDescription[dedupType]}
                >
                  {dedupType}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </div>
        </div> */}

        {hasData && meta && (
          <div className="logs-panel-meta">
            {meta.map(item => (
              <div className="logs-panel-meta__item" key={item.label}>
                <span className="logs-panel-meta__label">{item.label}:</span>
                <span className="logs-panel-meta__value">{renderMetaItem(item.value, item.kind)}</span>
              </div>
            ))}
          </div>
        )}

        <div className="logs-rows">
          {hasData &&
          !deferLogs && // Only inject highlighterExpression in the first set for performance reasons
            firstRows.map((row, index) => (
              <LogRow
                key={index}
                getRows={getRows}
                getRowContext={getRowContext}
                highlighterExpressions={highlighterExpressions}
                row={row}
                showDuplicates={showDuplicates}
                showLabels={showLabels && hasLabel}
                showTime={showTime}
                timeZone={timeZone}
                onClickLabel={onClickLabel}
              />
            ))}
          {hasData &&
            !deferLogs &&
            renderAll &&
            lastRows.map((row, index) => (
              <LogRow
                key={PREVIEW_LIMIT + index}
                getRows={getRows}
                getRowContext={getRowContext}
                row={row}
                showDuplicates={showDuplicates}
                showLabels={showLabels && hasLabel}
                showTime={showTime}
                timeZone={timeZone}
                onClickLabel={onClickLabel}
              />
            ))}
          {hasData && deferLogs && <span>Rendering {processedRows.length} rows...</span>}
        </div>
        {!loading && !hasData && !scanning && (
          <div className="logs-panel-nodata">
            No logs found.
            <a className="link" onClick={this.onClickScan}>
              Scan for older logs
            </a>
          </div>
        )}

        {scanning && (
          <div className="logs-panel-nodata">
            <span>{scanText}</span>
            <a className="link" onClick={this.onClickStopScan}>
              Stop scan
            </a>
          </div>
        )}
      </div>
    );
  }
}