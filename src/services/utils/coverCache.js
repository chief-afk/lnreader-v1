import FastImage from '@d11/react-native-fast-image';
import { showToast } from '../../hooks/showToast';

const clearCoverCache = () => {
  FastImage.clearDiskCache();
  showToast('Cleared cover cache.');
};

export { clearCoverCache };
