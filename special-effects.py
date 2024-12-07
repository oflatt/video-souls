import numpy as np
import cv2


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


test_small = True

def do_video(path):
  video = Video(path)
  JUMP_THRESHOLD = 0.2

  prev_frame = None
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
      print(width, height)
      if test_small:
        next_frame = cv2.resize(next_frame, (320, 180))
      blurred = cv2.GaussianBlur(next_frame / 255., (41, 21), 0)
      if prev_frame is None:
          prev_frame = blurred
      diff = np.linalg.norm(blurred - prev_frame, axis=-1)
      jump_cut = diff.mean() > JUMP_THRESHOLD
      if jump_cut:
          prev_frame = 0.05 * prev_frame + 0.95 * blurred
          diff = np.linalg.norm(blurred - prev_frame, axis=-1)
      cv2.dilate(diff, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (21, 21), (10, 10)), dst=diff)
      np.subtract(diff, diff.mean(), out=diff)
      np.clip(diff, 0, 1, out=diff)
      # Get centroid
      # median_point = (diff * np.mgrid[:diff.shape[0], :diff.shape[1]]).sum(axis=(1, 2)) / max(diff.sum(), 1e-3)
      # median_point = (int(median_point[1]), int(median_point[0]))
      median_point = [
          np.searchsorted(np.cumsum(diff.sum(axis=0)) / max(diff.sum(), 1e-3), 0.5),
          np.searchsorted(np.cumsum(diff.sum(axis=1)) / max(diff.sum(), 1e-3), 0.5)
      ]
      prev_frame = 0.95 * prev_frame + 0.05 * blurred
      output = next_frame / 255. * diff[:, :, np.newaxis]
      cv2.circle(output, median_point, 5, (0, 0, 1), -1)

      # now make the output the original size again
      if test_small:
        output = cv2.resize(output, (int(width/2), int(height/2)))

      # output[:, :20, 1] = jump_cut
      cv2.imshow(WINDOW_NAME, output)
      if cv2.waitKey(1) == ord("q"):
          break

  cv2.destroyAllWindows()


if __name__ == "__main__":
  ## parse path from command line
  import sys
  path = sys.argv[1]
  do_video(path)