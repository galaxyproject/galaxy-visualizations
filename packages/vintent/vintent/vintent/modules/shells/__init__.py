from .bar_aggregate import BarAggregateShell
from .bar_series import BarSeriesShell
from .box_plot import BoxPlotShell
from .density import DensityShell
from .heatmap_correlation import HeatmapCorrelationShell
from .histogram import HistogramShell
from .line_time import LineTimeShell
from .linear_regression import LinearRegressionShell
from .scatter import ScatterShell

SHELLS = {
    "bar_aggregate": BarAggregateShell(),
    "bar_series": BarSeriesShell(),
    "box_plot": BoxPlotShell(),
    "density": DensityShell(),
    "linear_regression": LinearRegressionShell(),
    "heatmap_correlation": HeatmapCorrelationShell(),
    "histogram": HistogramShell(),
    "line_time": LineTimeShell(),
    "scatter": ScatterShell(),
}
