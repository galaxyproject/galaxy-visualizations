from .bar_aggregate import BarAggregateShell
from .bar_series import BarSeriesShell
from .box_plot import BoxPlotShell
from .cardinality_report import CardinalityReportShell
from .density import DensityShell
from .heatmap_correlation import HeatmapCorrelationShell
from .heatmap_covariance import HeatmapCovarianceShell
from .histogram import HistogramShell
from .line_time import LineTimeShell
from .linear_regression import LinearRegressionShell
from .pca import PCAShell
from .scatter import ScatterShell
from .summary_statistics import SummaryStatisticsShell

SHELLS = {
    "bar_aggregate": BarAggregateShell(),
    "bar_series": BarSeriesShell(),
    "box_plot": BoxPlotShell(),
    "cardinality_report": CardinalityReportShell(),
    "density": DensityShell(),
    "linear_regression": LinearRegressionShell(),
    "heatmap_correlation": HeatmapCorrelationShell(),
    "heatmap_covariance": HeatmapCovarianceShell(),
    "histogram": HistogramShell(),
    "line_time": LineTimeShell(),
    "pca": PCAShell(),
    "scatter": ScatterShell(),
    "summary_statistics": SummaryStatisticsShell(),
}
