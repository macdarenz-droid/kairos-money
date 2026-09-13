package app.kairos.money;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Rect;
import android.util.Base64;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;

@CapacitorPlugin(name = "KairosText")
public class KairosTextPlugin extends Plugin {
    @PluginMethod public void recognize(PluginCall call) {
        String encoded = call.getString("base64", "");
        if (encoded.length() > 28000000) { call.reject("Image exceeds 20 MB. Choose a smaller scan."); return; }
        try {
            byte[] bytes = Base64.decode(encoded, Base64.DEFAULT);
            BitmapFactory.Options bounds = new BitmapFactory.Options(); bounds.inJustDecodeBounds = true;
            BitmapFactory.decodeByteArray(bytes, 0, bytes.length, bounds);
            if (bounds.outWidth <= 0 || bounds.outHeight <= 0 || (long) bounds.outWidth * bounds.outHeight > 25000000L) { java.util.Arrays.fill(bytes, (byte) 0); call.reject("Image dimensions are unsupported. Resize the scan below 25 megapixels."); return; }
            BitmapFactory.Options options = new BitmapFactory.Options(); options.inSampleSize = 1;
            while (Math.max(bounds.outWidth, bounds.outHeight) / options.inSampleSize > 3000) options.inSampleSize *= 2;
            Bitmap bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options); java.util.Arrays.fill(bytes, (byte) 0);
            if (bitmap == null) { call.reject("The image could not be decoded. Choose a PNG or JPEG."); return; }
            TextRecognizer recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
            recognizer.process(InputImage.fromBitmap(bitmap, 0)).addOnSuccessListener(result -> {
                JSArray items = new JSArray();
                for (Text.TextBlock block : result.getTextBlocks()) for (Text.Line line : block.getLines()) for (Text.Element element : line.getElements()) {
                    Rect box = element.getBoundingBox(); if (box == null) continue;
                    JSObject item = new JSObject(); item.put("text", element.getText()); item.put("x", box.left); item.put("y", line.getBoundingBox() == null ? box.top : line.getBoundingBox().top); item.put("width", box.width()); items.put(item);
                }
                JSObject output = new JSObject(); output.put("items", items); call.resolve(output);
            }).addOnFailureListener(error -> call.reject("On-device text recognition failed. Choose a sharper scan or CSV.")).addOnCompleteListener(task -> { bitmap.recycle(); recognizer.close(); });
        } catch (IllegalArgumentException error) { call.reject("Image data is invalid. Choose the file again."); }
    }
}
