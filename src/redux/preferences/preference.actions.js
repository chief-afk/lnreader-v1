import {
  REMOVE_CHAPTER_POSITIONS,
  SAVE_SCROLL_POSITION,
} from '../preferences/preference.types';

export const saveScrollPosition =
  (position, percentage, chapterId, novelId) => async dispatch => {
    dispatch({
      type: SAVE_SCROLL_POSITION,
      payload: {
        position,
        percentage,
        chapterId,
        novelId,
      },
    });
  };

export const removeChapterPositions = (novelId, chapterIds) => ({
  type: REMOVE_CHAPTER_POSITIONS,
  payload: {
    novelId,
    chapterIds,
  },
});
