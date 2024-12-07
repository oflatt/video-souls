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

def diff_frames(prev_frame, next_frame, threshold, add_boxes=False):
  gray = cv2.cvtColor(next_frame, cv2.COLOR_BGR2GRAY)
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

  
  return (frame, prev_frame)


# now that we have done some motion detection, look for fast moving
# objects that are likely attacks
def detect_attacks(prev_frame, next_frame):
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
  _, thresh = cv2.threshold(diff, 240, 255, cv2.THRESH_BINARY)

  # back to rgb image
  frame = cv2.cvtColor(thresh, cv2.COLOR_GRAY2RGB)
  return frame
  


test_small = True

def do_video(path):
  video = Video(path)

  prev_frame = None
  prev_motion_frame = None
  for next_frame in video:
      # flow = cv2.calcOpticalFlowFarneback(
      #     process_frame(video.prev),
      #     process_frame(next_frame),
      #     flow=None, pyr_scale=0.5, levels=3, winsize=15,
      #     iterations=3, poly_n=5, poly_sigma=1.1, flags=0
      # )
      # flow_bgr = np.stack([flow[:, :, 0], np.zeros_like(flow[:, :, 0]), flow[:, :, 1]], axis=2)
      # cv2.imshow(WINDOW_NAME, flow_bgr)
      # get current size of frame
      width = int(video.cap.get(3))
      height = int(video.cap.get(4))
      if test_small:
        next_frame = cv2.resize(next_frame, (320, 180))

      (diffed, new_prev) = diff_frames(prev_frame, next_frame, 30)

      
      

      # now make the output the original size again
      to_show = detect_attacks(prev_motion_frame, diffed)
      if test_small:
        to_show = cv2.resize(to_show, (int(width/2), int(height/2)))

      prev_frame = new_prev
      prev_motion_frame = diffed
      # output[:, :20, 1] = jump_cut
      cv2.imshow(WINDOW_NAME, to_show)
      if cv2.waitKey(1) == ord("q"):
          break

  cv2.destroyAllWindows()


if __name__ == "__main__":
  ## parse path from command line
  import sys
  path = sys.argv[1]
  do_video(path)