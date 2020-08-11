namespace Azure {

    // -------------- 1. Initialization ----------------
    //%blockId=Azure_initialize_wifi
    //%block="Initialize WiFi and OLED"
    //% weight=140
    //% blockGap=7	
    export function initializeWifi(): void {
        serial.redirect(SerialPin.P16, SerialPin.P8, BaudRate.BaudRate115200)
        OLED.init(64, 128)
        serial.onDataReceived(serial.delimiters(Delimiters.NewLine), function () {
            OLED.showStringWithNewLine(serial.readLine())
        })
        basic.pause(5000)
    }

    // -------------- 1. WiFi ----------------
    //% blockId=smarthon_set_wifi
    //% block="Set wifi to ssid %ssid| pwd %pwd"   
    //% weight=45
    //% blockGap=7	
    export function setWifi(ssid: string, pwd: string): void {
        serial.writeLine("(AT+wifi?ssid=" + ssid + "&pwd=" + pwd + ")");
    }

    // -------------- 2. Cloud ----------------
    //% blockId=smarthon_set_thingspeak
    //% block="Send Thingspeak key* %key|field1 %field1|field2 %field2|field3 %field3"
    //% weight=44
    //% blockGap=7
    export function sendThingspeak(key: string, field1: number, field2: number, field3: number): void {
        serial.writeLine("(AT+thingspeak?key=" + key + "&field1=" + field1 + "&field2=" + field2 + "&field3=" + field3 + ")");
    }

    // -------------- 3. Connect Azure Cloud ----------------
    //% blockId=smarthon_connect_azure
    //% block="Connect Microsoft Azure IoT Central Scope ID %scopeid|Device ID %deviceid|Primary Key %primarykey"
    //% weight=43
    //% blockGap=7
    export function connectAzure(scopeid: string, deviceid: string, primarykey: string): void {
        serial.writeLine("(AT+connectAzure?scopeid=" + scopeid + "&deviceid=" + deviceid + "&primarykey=" + primarykey + ")");
    }

    // -------------- 4. Upload data to Azure Cloud ----------------
    //% blockId=smarthon_upload_azure
    //% block="Upload data to Microsoft Azure IoT Central field1 %field1|field2 %field2|field3 %field3|field4 %field4|field5 %field5"
    //% weight=42	
    export function uploadDataAzure(field1: number, field2: number, field3: number, field4: number, field5: number): void {
        serial.writeLine("(AT+uploadAzure?field1=" + field1 + "&field2=" + field2 + "&field3=" + field3 + "&field4=" + field4 + "&field5=" + field5 + ")");
    }



}

namespace smbus {
    export function writeByte(addr: number, register: number, value: number): void {
        let temp = pins.createBuffer(2);
        temp[0] = register;
        temp[1] = value;
        pins.i2cWriteBuffer(addr, temp, false);
    }
    export function writeBuffer(addr: number, register: number, value: Buffer): void {
        let temp = pins.createBuffer(value.length + 1);
        temp[0] = register;
        for (let x = 0; x < value.length; x++) {
            temp[x + 1] = value[x];
        }
        pins.i2cWriteBuffer(addr, temp, false);
    }
    export function readBuffer(addr: number, register: number, len: number): Buffer {
        let temp = pins.createBuffer(1);
        temp[0] = register;
        pins.i2cWriteBuffer(addr, temp, false);
        return pins.i2cReadBuffer(addr, len, false);
    }
    function readNumber(addr: number, register: number, fmt: NumberFormat = NumberFormat.UInt8LE): number {
        let temp = pins.createBuffer(1);
        temp[0] = register;
        pins.i2cWriteBuffer(addr, temp, false);
        return pins.i2cReadNumber(addr, fmt, false);
    }
    export function unpack(fmt: string, buf: Buffer): number[] {
        let le: boolean = true;
        let offset: number = 0;
        let result: number[] = [];
        let num_format: NumberFormat = 0;
        for (let c = 0; c < fmt.length; c++) {
            switch (fmt.charAt(c)) {
                case '<':
                    le = true;
                    continue;
                case '>':
                    le = false;
                    continue;
                case 'c':
                case 'B':
                    num_format = le ? NumberFormat.UInt8LE : NumberFormat.UInt8BE; break;
                case 'b':
                    num_format = le ? NumberFormat.Int8LE : NumberFormat.Int8BE; break;
                case 'H':
                    num_format = le ? NumberFormat.UInt16LE : NumberFormat.UInt16BE; break;
                case 'h':
                    num_format = le ? NumberFormat.Int16LE : NumberFormat.Int16BE; break;
            }
            result.push(buf.getNumber(num_format, offset));
            offset += pins.sizeOf(num_format);
        }
        return result;
    }
}