import { SET_NOVEL_SETTINGS } from '../novel/novel.types';
import {
  REMOVE_CHAPTER_POSITIONS,
  SAVE_SCROLL_POSITION,
  SET_CHAPTER_LIST_PREF,
  SET_LAST_READ,
} from './preference.types';

const initialState = {
  novelSettings: {},
};

const novelReducer = (state = initialState, action) => {
  const { type, payload } = action;

  switch (type) {
    case SET_LAST_READ:
      return {
        ...state,
        novelSettings: {
          ...state.novelSettings,
          [payload.novelId]: {
            ...state.novelSettings[payload.novelId],
            lastRead: payload.chapterId,
          },
        },
      };
    case SET_CHAPTER_LIST_PREF:
      return {
        ...state,
        novelSettings: {
          ...state.novelSettings,
          [payload.novelId]: {
            ...state.novelSettings[payload.novelId],
            sort: payload.sort,
            filter: payload.filter,
          },
        },
      };
    case SET_NOVEL_SETTINGS:
      return {
        ...state,
        novelSettings: {
          ...state.novelSettings,
          [payload.novelId]: {
            ...state.novelSettings[payload.novelId],
            showChapterTitles: payload.value,
          },
        },
      };
    case SAVE_SCROLL_POSITION:
      return {
        ...state,
        novelSettings: {
          ...state.novelSettings,
          [payload.novelId]: {
            ...state.novelSettings[payload.novelId],
            position: {
              ...state.novelSettings[payload.novelId].position,
              [payload.chapterId]: {
                position: payload.position,
                percentage: payload.percentage,
              },
            },
          },
        },
      };
    case REMOVE_CHAPTER_POSITIONS: {
      const settings = state.novelSettings[payload.novelId];

      if (!settings?.position) {
        return state;
      }

      const position = { ...settings.position };

      (payload.chapterIds || Object.keys(position)).forEach(id => {
        delete position[id];
      });

      return {
        ...state,
        novelSettings: {
          ...state.novelSettings,
          [payload.novelId]: {
            ...settings,
            position,
          },
        },
      };
    }
    default:
      return state;
  }
};

export default novelReducer;
