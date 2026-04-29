import numpy as np


def centroid(bbox: list[float]) -> tuple[float, float]:
    x1, y1, x2, y2 = bbox
    return (x1 + x2) / 2, (y1 + y2) / 2


def compute_iou(bbox_a: list[float], bbox_b: list[float]) -> float:
    ax1, ay1, ax2, ay2 = bbox_a
    bx1, by1, bx2, by2 = bbox_b

    inter_x1 = max(ax1, bx1)
    inter_y1 = max(ay1, by1)
    inter_x2 = min(ax2, bx2)
    inter_y2 = min(ay2, by2)

    inter_w = max(0.0, inter_x2 - inter_x1)
    inter_h = max(0.0, inter_y2 - inter_y1)
    inter_area = inter_w * inter_h

    area_a = (ax2 - ax1) * (ay2 - ay1)
    area_b = (bx2 - bx1) * (by2 - by1)
    union_area = area_a + area_b - inter_area

    if union_area <= 0:
        return 0.0
    return inter_area / union_area


def point_in_polygon(point: tuple[float, float], polygon: list[list[float]]) -> bool:
    pts = np.array(polygon, dtype=np.float32)
    result = cv_point_in_contour(pts, point)
    return result


def cv_point_in_contour(
    polygon: np.ndarray, point: tuple[float, float]
) -> bool:
    """Ray-casting point-in-polygon test (no OpenCV dependency)."""
    x, y = point
    n = len(polygon)
    inside = False
    j = n - 1
    for i in range(n):
        xi, yi = polygon[i]
        xj, yj = polygon[j]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi) + xi):
            inside = not inside
        j = i
    return inside


def line_crossing_check(
    y_prev: float,
    y_curr: float,
    line_y: float,
) -> bool:
    """Return True when a track crosses line_y from above in the downward direction."""
    return y_prev < line_y and y_curr >= line_y and (y_curr - y_prev) > 0
