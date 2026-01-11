from .bar_aggregate import BarAggregateShell
from .bar_count import BarCountShell
from .bar_series import BarSeriesShell
from .box_plot import BoxPlotShell
from .box_plot_grouped import BoxPlotGroupedShell
from .cardinality_report import CardinalityReportShell
from .density import DensityShell
from .ecdf import ECDFShell
from .heatmap_correlation import HeatmapCorrelationShell
from .heatmap_count import HeatmapCountShell
from .heatmap_covariance import HeatmapCovarianceShell
from .histogram import HistogramShell
from .line_time import LineTimeShell
from .linear_regression import LinearRegressionShell
from .normalized_stacked_bar import NormalizedStackedBarShell
from .pca import PCAShell
from .scatter import ScatterShell
from .stacked_bar_aggregate import StackedBarAggregateShell
from .strip_plot import StripPlotShell
from .summary_statistics import SummaryStatisticsShell
from .violin_plot import ViolinPlotShell

SHELLS = {
    "bar_aggregate": BarAggregateShell(),
    "bar_count": BarCountShell(),
    "bar_series": BarSeriesShell(),
    "box_plot_grouped": BoxPlotGroupedShell(),
    "box_plot": BoxPlotShell(),
    "cardinality_report": CardinalityReportShell(),
    "density": DensityShell(),
    "ecdf": ECDFShell(),
    "heatmap_correlation": HeatmapCorrelationShell(),
    "heatmap_count": HeatmapCountShell(),
    "heatmap_covariance": HeatmapCovarianceShell(),
    "histogram": HistogramShell(),
    "line_time": LineTimeShell(),
    "linear_regression": LinearRegressionShell(),
    "normalized_stacked_bar": NormalizedStackedBarShell(),
    "pca": PCAShell(),
    "scatter": ScatterShell(),
    "stacked_bar_aggregate": StackedBarAggregateShell(),
    "strip_plot": StripPlotShell(),
    "summary_statistics": SummaryStatisticsShell(),
    "violin_plot": ViolinPlotShell(),
}
