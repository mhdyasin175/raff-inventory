import { CAMERA_VIDEO, SCANNED_BARCODE } from './camera';
import { writeBarcodeVideo } from './barcode-video';

export default function globalSetup() {
  writeBarcodeVideo(CAMERA_VIDEO, SCANNED_BARCODE);
}
