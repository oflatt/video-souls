import numpy as np
import cv2
import imutils
import math
import random
import itertools


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
     blurred = cv2.GaussianBlur(gray, (31, 31), 0)
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
  boxes = [box for box in boxes if area(box) > 50 and area(box) < 1000000]
  return boxes

# check if some points are roughly colinear by measuring the angle to the vector between the first and last point
def are_points_colinear(points, tolerance=0.2):
  vector = np.array(points[-1]) - np.array(points[0])

  max_angle = 0
  for i in range(len(points)):
    for j in range(i + 1, len(points)):
      if i == j:
        continue
      if points[i] is None or points[j] is None:
        continue
      v = np.array(points[j]) - np.array(points[i])
      angle_v_vector = np.arccos(np.dot(v, vector) / (np.linalg.norm(v) * np.linalg.norm(vector)))
      v2 = np.array(points[i]) - np.array(points[j])
      angle_v2_vector = np.arccos(np.dot(v2, vector) / (np.linalg.norm(v2) * np.linalg.norm(vector)))
      min_angle = min(angle_v_vector, angle_v2_vector)
      if min_angle > max_angle:
        max_angle = min_angle



  return max_angle < tolerance

def find_lines(list_of_set_of_boxes):
  # convert all boxes to points
  points = []
  for boxes in list_of_set_of_boxes:
    boxes_points = []
    for box in boxes:
      x, y, w, h = box
      boxes_points.append((x + w / 2, y + h / 2))
    points.append(boxes_points)

  # now compute the cartesian product of points from each frame
  point_combinations = itertools.product(*points)

  lines = []

  for point_combination in point_combinations:
    if are_points_colinear(point_combination):
      lines.append((point_combination[0], point_combination[-1]))


  return lines

def make_lines_from_motion_frames(last_n_motion_frames):
  if len(last_n_motion_frames) < 6:
    # empty picture with same size as last frame
    return last_n_motion_frames[-1]
  
  # find boxes for last 3
  boxes_for_last_frames = [find_boxes(frame) for frame in last_n_motion_frames[-3:]]

  lines_found = find_lines(boxes_for_last_frames)

  # pick a max of 3 lines
  if len(lines_found) > 3:
    lines_found = lines_found[:3]
  
  res = lines_found.copy()

  # now make lots of other lines parallel to those found, but with different lengths and distances away
  for line in lines_found:
    random_num_lines = random.randint(1, 2)
    for i in range(random_num_lines):
      # make a new line that is parallel to the original
      # but with a random length and distance away
      point1, point2 = line
      x1, y1 = point1
      x2, y2 = point2
      
      v = (x2 - x1, y2 - y1)
      perp_v = (-v[1], v[0])

      normalized_v = (v[0] / np.linalg.norm(v), v[1] / np.linalg.norm(v))
      normalized_perp_v = (perp_v[0] / np.linalg.norm(perp_v), perp_v[1] / np.linalg.norm(perp_v))

      random_drift = (random.uniform(0.0, 30.0), random.uniform(0.0, 30.0))
      random_length = random.uniform(0.8, 1.2)
      new_point1 = (x1 + random_drift[0], y1 + random_drift[1])
      new_point2 = new_point1[0] + v[0] * random_length, new_point1[1] + v[1] * random_length
      res.append((new_point1, new_point2))

  return res

  


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
  current_index = len(lines) - 1
  starting_transparency = 1.0
  current_transparency = 1.0
  dropoff = 0.9
  while current_index >= 0:
    if len(lines) - current_index > 50:
      break
    lines_in_a_frame = lines[current_index]
    if len(lines_in_a_frame) == 0:
      current_index -= 1
      current_transparency *= dropoff
      continue

    copy = frame.copy()
    for line in lines_in_a_frame:
      cv2.line(copy, (int(line[0][0]), int(line[0][1])), (int(line[1][0]), int(line[1][1])), (0, 255, 0), 1)
    
    frame = frame * (1 - current_transparency) + copy * current_transparency
    current_index -= 1
    current_transparency *= dropoff

  # now cast to integers
  frame = frame.astype(np.uint8)
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