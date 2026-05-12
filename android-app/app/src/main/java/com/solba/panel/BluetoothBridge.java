package com.solba.panel;

import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothSocket;
import android.content.Context;
import android.os.Build;
import android.util.Base64;
import android.webkit.JavascriptInterface;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.IOException;
import java.io.OutputStream;
import java.util.Set;
import java.util.UUID;

/**
 * Puente JavaScript ↔ Bluetooth Clásico SPP.
 * Se expone como window.AndroidBridge en el WebView.
 *
 * API disponible desde JS:
 *   AndroidBridge.listBluetoothDevices() → JSON string [{name, address}, ...]
 *   AndroidBridge.connectPrinter(address) → "OK" | "ERROR:..."
 *   AndroidBridge.printESCPOS(base64)     → "OK" | "ERROR:..."
 *   AndroidBridge.disconnectPrinter()
 */
public class BluetoothBridge {

    // UUID estándar del perfil SPP (Serial Port Profile) Bluetooth Clásico
    private static final UUID SPP_UUID =
            UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");

    private final Context context;
    private BluetoothSocket socket;
    private OutputStream outputStream;
    private String connectedAddress;

    public BluetoothBridge(Context context) {
        this.context = context;
    }

    /** Devuelve el BluetoothAdapter compatible con todas las versiones de Android. */
    private BluetoothAdapter getAdapter() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            BluetoothManager mgr = (BluetoothManager) context.getSystemService(Context.BLUETOOTH_SERVICE);
            return mgr != null ? mgr.getAdapter() : null;
        } else {
            return BluetoothAdapter.getDefaultAdapter();
        }
    }

    /** Devuelve JSON con todos los dispositivos Bluetooth emparejados en el Android. */
    @JavascriptInterface
    public String listBluetoothDevices() {
        try {
            BluetoothAdapter adapter = getAdapter();
            if (adapter == null) return "[]";
            Set<BluetoothDevice> paired = adapter.getBondedDevices();
            JSONArray arr = new JSONArray();
            for (BluetoothDevice d : paired) {
                JSONObject obj = new JSONObject();
                obj.put("name", d.getName() != null ? d.getName() : d.getAddress());
                obj.put("address", d.getAddress());
                arr.put(obj);
            }
            return arr.toString();
        } catch (Exception e) {
            return "[]";
        }
    }

    /** Conecta a la impresora Bixolon (Bluetooth Clásico SPP) por dirección MAC. */
    @JavascriptInterface
    public String connectPrinter(String address) {
        try {
            disconnectPrinter();
            BluetoothAdapter adapter = getAdapter();
            if (adapter == null) return "ERROR:Bluetooth no disponible";
            BluetoothDevice device = adapter.getRemoteDevice(address);
            socket = device.createRfcommSocketToServiceRecord(SPP_UUID);
            adapter.cancelDiscovery();
            socket.connect();
            outputStream = socket.getOutputStream();
            connectedAddress = address;
            return "OK";
        } catch (Exception e) {
            socket = null;
            outputStream = null;
            return "ERROR:" + e.getMessage();
        }
    }

    /**
     * Envía bytes ESC/POS codificados en base64 a la impresora conectada.
     * Si la conexión se ha caído, intenta reconectar una vez.
     */
    @JavascriptInterface
    public String printESCPOS(String base64Data) {
        try {
            if (outputStream == null) return "ERROR:No conectado. Llama a connectPrinter primero.";
            byte[] bytes = Base64.decode(base64Data, Base64.DEFAULT);
            outputStream.write(bytes);
            outputStream.flush();
            return "OK";
        } catch (IOException e) {
            // Intentar reconectar una vez
            if (connectedAddress != null) {
                String r = connectPrinter(connectedAddress);
                if ("OK".equals(r)) {
                    return printESCPOS(base64Data);
                }
            }
            return "ERROR:" + e.getMessage();
        }
    }

    /** Cierra la conexión Bluetooth. */
    @JavascriptInterface
    public void disconnectPrinter() {
        try {
            if (outputStream != null) outputStream.close();
        } catch (IOException ignored) {}
        try {
            if (socket != null) socket.close();
        } catch (IOException ignored) {}
        socket = null;
        outputStream = null;
    }
}
