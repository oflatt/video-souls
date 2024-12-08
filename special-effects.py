import numpy as np
import cv2
import imutils
import math


WINDOW_NAME = "video"

class Video:
    def __init__(self, filename: str):
        self.cap = cv2.VideoCapture(filename)
        _, self.current = self.cap.read()
        self.prev = None

    def __iter__(self):
        return self

    def __next__(self) -> np.ndarray:
        self.prev = self.current
        ret, self.current = self.cap.read()
        if not ret:
            raise StopIteration
        return self.current


def process_frame(frame: np.ndarray) -> np.ndarray:
    return cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

def diff_frames(prev_frame, next_frame, threshold, add_boxes=False, blur=True):
  gray = cv2.cvtColor(next_frame, cv2.COLOR_BGR2GRAY)
  blurred = gray
  if blur:
     blurred = cv2.GaussianBlur(gray, (41, 41), 0)
  if prev_frame is None:
    prev_frame = blurred
  # print dimensions of blurred and prev_frame
  diff = cv2.absdiff(blurred, prev_frame)
  JUMP_THRESHOLD = 0.2
  #jump_cut = diff.mean() > JUMP_THRESHOLD
  #if jump_cut:
  #    prev_frame = 0.05 * prev_frame + 1.0 * blurred
  #    print(blurred.shape)
  #    print(prev_frame.shape)
  #   diff = cv2.absdiff(blurred, prev_frame)
  
  thresh = cv2.threshold(diff, threshold, 255, cv2.THRESH_BINARY)[1]
  cnts = cv2.findContours(thresh.copy(), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
  cnts = imutils.grab_contours(cnts)

  frame = cv2.cvtColor(thresh, cv2.COLOR_GRAY2RGB)
  if add_boxes:
    for c in cnts:
      if cv2.contourArea(c) < 500:
        continue
      (x, y, w, h) = cv2.boundingRect(c)
      cv2.rectangle(frame, (x, y), (x + w, y + h), (0, 255, 0), 2)

  prev_frame = (blurred * 0.8 + gray * 0.2).astype(np.uint8)
  return (frame, prev_frame)


# now that we have done some motion detection, look for fast moving
# objects that are likely attacks
def detect_attacks(prev_frame, next_frame, threshold):
  if prev_frame is None:
    prev_frame = next_frame
  gray = cv2.cvtColor(next_frame, cv2.COLOR_BGR2GRAY)
  if prev_frame is None:
    prev_frame = gray
  else:
    prev_frame = cv2.cvtColor(prev_frame, cv2.COLOR_BGR2GRAY)
  
  diff = cv2.absdiff(prev_frame, gray)
  # blur the diff to look for large changes
  diff = cv2.GaussianBlur(diff, (41, 41), 0)
  # threshold the diff
  # threshold 20 works well for outlining people
  _, thresh = cv2.threshold(diff, threshold, 255, cv2.THRESH_BINARY)

  # back to rgb image
  frame = cv2.cvtColor(thresh, cv2.COLOR_GRAY2RGB)
  return frame

def find_boxes(frame):
  greycurrent = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
  # find bounding boxes in current using contours
  cnts = cv2.findContours(greycurrent, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
  cnts = imutils.grab_contours(cnts)

  boxes = []
  for c in cnts:
     # convert to a bounding box (x, y, w, h)
    (x, y, w, h) = cv2.boundingRect(c)
    boxes.append((x, y, w, h))

  def area(box):
    return box[2] * box[3]
  
  # filter boxes that are too small in area and ones that are too big
  boxes = [box for box in boxes if area(box) > 500 and area(box) < 5000]
  return boxes

# find boxes that are nearby
def box_pairs(boxes1, boxes2):
  pairs = []
  for box1 in boxes1:
    for box2 in boxes2:
      # distance between centers of boxes
      center1 = (box1[0] + box1[2] / 2, box1[1] + box1[3] / 2)
      center2 = (box2[0] + box2[2] / 2, box2[1] + box2[3] / 2)
      distance = np.linalg.norm(np.array(center1) - np.array(center2))
      # if the boxes are close enough
      if distance < 70:
        pairs.append((box1, box2))
  return pairs

def are_points_colinear(p1, p2, p3, tolerance=0.1):
    """
    Check if three points are roughly collinear based on angle, not distance.

    Parameters:
        p1, p2, p3: Tuples representing points in the format (x, y).
        tolerance: The acceptable tolerance for determining collinearity (in radians).

    Returns:
        True if the points are roughly collinear, False otherwise.
    """
    x1, y1 = p1
    x2, y2 = p2
    x3, y3 = p3

    # Compute vectors p1->p2 and p1->p3
    v1 = (x2 - x1, y2 - y1)
    v2 = (x3 - x1, y3 - y1)

    # Calculate the dot product and magnitudes of the vectors
    dot_product = v1[0] * v2[0] + v1[1] * v2[1]
    magnitude_v1 = math.sqrt(v1[0]**2 + v1[1]**2)
    magnitude_v2 = math.sqrt(v2[0]**2 + v2[1]**2)

    # Avoid division by zero for degenerate cases
    if magnitude_v1 == 0 or magnitude_v2 == 0:
        return True  # All points are coincident or one segment is degenerate

    # Calculate the cosine of the angle between the vectors
    cos_angle = dot_product / (magnitude_v1 * magnitude_v2)

    # Ensure the cosine value is within valid range [-1, 1] due to numerical errors
    cos_angle = max(-1, min(1, cos_angle))

    # Calculate the angle in radians
    angle = math.acos(cos_angle)

    # Check if the angle is close to 0 or pi (collinear)
    return abs(angle) < tolerance or abs(angle - math.pi) < tolerance

def find_lines(boxes1, boxes2, boxes3):
  points1 = [(box[0] + box[2] / 2, box[1] + box[3] / 2) for box in boxes1]
  points2 = [(box[0] + box[2] / 2, box[1] + box[3] / 2) for box in boxes2]
  points3 = [(box[0] + box[2] / 2, box[1] + box[3] / 2) for box in boxes3]

  # find roughly colinear points
  lines = []
  for point1 in points1:
    for point2 in points2:
      for point3 in points3:
        if are_points_colinear(point1, point2, point3):
          lines.append((point1, point2, point3))        

  return lines

def make_lines_from_motion_frames(last_n_motion_frames):
  if len(last_n_motion_frames) < 5:
    # empty picture with same size as last frame
    return last_n_motion_frames[-1]
  
  current = last_n_motion_frames[-1].copy()
  prev = last_n_motion_frames[-2].copy()
  prev2 = last_n_motion_frames[-3].copy()
  boxes1 = find_boxes(current)
  boxes2 = find_boxes(prev)
  boxes3 = find_boxes(prev2)

  return find_lines(boxes1, boxes2, boxes3)

  


def combine_motion_frames(frames):
  if len(frames) == 0:
    return None
  
  starting_transparency = 0.3
  dropoff = 0.8
  # make older frames more transparent, linear decay
  frame = frames[len(frames) - 1] * starting_transparency
  current_index = len(frames) - 2
  rest_brightness = starting_transparency * dropoff
  while current_index >= 0:
    frame += frames[current_index] * rest_brightness
    rest_brightness *= dropoff
    current_index -= 1
  
  # use astype to go back to integers
  frame = frame.astype(np.uint8)

  return frame


def draw_lines(lines, frame):
  for lines_in_a_frame in lines:
    for line in lines_in_a_frame:
      cv2.line(frame, (int(line[0][0]), int(line[0][1])), (int(line[1][0]), int(line[1][1])), (0, 255, 0), 1)
  return frame

# given an aura,
# add a cool outline to it
def outline_aura(aura):
  # convert to greyscale
  gray = cv2.cvtColor(aura, cv2.COLOR_BGR2GRAY)
  # make the aura a bit bigger
  kernel = np.ones((1, 1), np.uint8)
  dilated = cv2.dilate(gray, kernel, iterations=1)
  contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

  # draw the contours to aura with some transparency
  for contour in contours:
    cv2.drawContours(aura, [contour], -1, (0, 255, 0), 1)

  return aura

def draw_aura(aura, original_frame):
  # copy the original frame
  frame = original_frame.copy()

  # threshold the aura
  #_, aura = cv2.threshold(aura, 20, 255, cv2.THRESH_BINARY)
  mask = cv2.cvtColor(aura, cv2.COLOR_BGR2GRAY) > 0
  mask = cv2.cvtColor(aura, cv2.COLOR_BGR2GRAY)[:, :, np.newaxis] / 255.

  # make all the white parts red
  aura[:, :, 0] = 0
  aura[:, :, 1] = 0

  # scale aura to size of frame
  aura = cv2.resize(aura, (frame.shape[1], frame.shape[0]))

  frame = (frame * (1 - mask) + aura * mask).astype(np.uint8)

  return frame

test_small = True

def do_video(path):
  video = Video(path)

  last_n_motion_frames = []
  N = 10

  prev_diffed = None
  last_diffed = None
  prev_diffed2 = None
  all_lines = []
  for next_frame in video:
      width = next_frame.shape[1]
      height = next_frame.shape[0]

      if test_small:
         next_frame = cv2.resize(next_frame, (320, 180))

      scaled_down = cv2.resize(next_frame, (320, 180))

      (diffed, new_prev) = diff_frames(prev_diffed, scaled_down, 20)

      # now make the output the original size again
      diffed2 = detect_attacks(last_diffed, diffed, 100)
      diffed3 = detect_attacks(prev_diffed2, diffed2, 100)
      last_n_motion_frames.append(diffed2)
      if len(last_n_motion_frames) > N:
        last_n_motion_frames.pop(0)

      combined_motion = combine_motion_frames(last_n_motion_frames)
      lines = make_lines_from_motion_frames(last_n_motion_frames)
      all_lines.append(lines)
      drawn_lines = draw_lines(all_lines, diffed2)
      #outlined = outline_aura(combined_motion)

      to_show = draw_aura(drawn_lines, next_frame)
      if test_small:
        to_show = cv2.resize(to_show, (int(width/2), int(height/2)))

      prev_diffed = new_prev

      last_diffed = diffed
      prev_diffed2 = diffed2


      # output[:, :20, 1] = jump_cut
      cv2.imshow(WINDOW_NAME, to_show)
      if cv2.waitKey(8) == ord("q"):
          break

  cv2.destroyAllWindows()


if __name__ == "__main__":
  ## parse path from command line
  import sys
  path = sys.argv[1]
  do_video(path)