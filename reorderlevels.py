import os
import shutil
import sys

def reorder_levels(levels_dir, old_num, new_num):
    # Build file lists as NN.json
    files = [f for f in os.listdir(levels_dir) if f.endswith('.json') and len(f) == 7 and f[:2].isdigit()]
    nums = sorted([int(f[:2]) for f in files])
    if old_num not in nums:
        print(f"Error: {str(old_num).zfill(2)}.json not found in {levels_dir}")
        return
    # Shift files from new_num upwards, except old_num
    for num in reversed(nums):
        if num >= new_num and num != old_num:
            src = os.path.join(levels_dir, f"{str(num).zfill(2)}.json")
            dst = os.path.join(levels_dir, f"{str(num+1).zfill(2)}.json")
            shutil.move(src, dst)
    # Move the chosen file to the new name
    src = os.path.join(levels_dir, f"{str(old_num).zfill(2)}.json")
    dst = os.path.join(levels_dir, f"{str(new_num).zfill(2)}.json")
    shutil.move(src, dst)
    print("Renumbering complete.")

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python reorderlevels.py <old_num> <new_num>")
        sys.exit(1)
    reorder_levels("levels", int(sys.argv[1]), int(sys.argv[2]))