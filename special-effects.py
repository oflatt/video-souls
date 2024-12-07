import numpy as np
import cv2
import imutils


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
     blurred = cv2.GaussianBlur(gray, (21, 21), 0)
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
  diff = cv2.GaussianBlur(diff, (5, 5), 0)
  # threshold the diff
  # threshold 20 works well for outlining people
  _, thresh = cv2.threshold(diff, threshold, 255, cv2.THRESH_BINARY)

  # back to rgb image
  frame = cv2.cvtColor(thresh, cv2.COLOR_GRAY2RGB)
  return frame

def combine_motion_frames(frames):
  if len(frames) == 0:
    return None
  
  # make older frames more transparent, linear decay
  frame = frames[len(frames) - 1] * 0.8
  current_index = len(frames) - 2
  rest_brightness = 0.5
  while current_index >= 0:
    frame += frames[current_index] * rest_brightness
    rest_brightness *= 0.2
    current_index -= 1
  
  # use astype to go back to integers
  frame = frame.astype(np.uint8)

  return frame


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
  N = 100

  prev_diffed = None
  last_diffed = None
  prev_diffed2 = None
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
      last_n_motion_frames.append(diffed3)
      if len(last_n_motion_frames) > N:
        last_n_motion_frames.pop(0)

      combined_motion = combine_motion_frames(last_n_motion_frames)

      to_show = draw_aura(combined_motion, next_frame)
      if test_small:
        to_show = cv2.resize(to_show, (int(width/2), int(height/2)))

      prev_diffed = new_prev

      last_diffed = diffed
      prev_diffed2 = diffed2


      # output[:, :20, 1] = jump_cut
      cv2.imshow(WINDOW_NAME, to_show)
      if cv2.waitKey(2) == ord("q"):
          break

  cv2.destroyAllWindows()


if __name__ == "__main__":
  ## parse path from command line
  import sys
  path = sys.argv[1]
  do_video(path)