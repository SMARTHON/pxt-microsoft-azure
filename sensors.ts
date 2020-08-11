namespace Plant {    

	// BH1750
	pins.i2cWriteNumber(35, 0x10, NumberFormat.UInt8BE)
	
	// BME280
	class bme280 {
        is_setup: boolean
        addr: number
        dig_t1: uint16
        dig_t2: int16
        dig_t3: int16
        dig_p1: uint16
        dig_p2: int16
        dig_p3: int16
        dig_p4: int16
        dig_p5: int16
        dig_p6: int16
        dig_p7: int16
        dig_p8: int16
        dig_p9: int16
        dig_h1: uint8
        dig_h2: int16
        dig_h3: uint8
        dig_h4: int16
        dig_h5: int16
        dig_h6: int8

        temperature: number
        pressure: number
        humidity: number
        altitude: number
        //qnh: number

        constructor(addr: number) {
            this.is_setup = false
            this.addr = addr
        }

        setup(): void {
            if (this.is_setup) return
            this.is_setup = true
            //this.qnh = 101325 // hPa standard ISO atmosphere at sea level

            smbus.writeByte(this.addr, 0xe0, 0xb6) // Soft reset
            control.waitMicros(200000)
            smbus.writeByte(this.addr, 0xf2, 0b00000111) // x16 humidity oversampling
            control.waitMicros(200000)
            smbus.writeByte(this.addr, 0xf4, 0b10110111) // x16 oversampling, normal mode
            control.waitMicros(200000)
            smbus.writeByte(this.addr, 0xf5, 0b10010000) // 500ms standby time, 16 filter coef
            control.waitMicros(200000)

            // Registers 0x88 to 0x9F, then 0xA0 padding byte (b) and finally 0xA1
            let compensation: number[] = smbus.unpack("<HhhHhhhhhhhhbB", smbus.readBuffer(this.addr, 0x88, 26))

            // Registers 0xE1 to 0xE7
            let temp: number[] = smbus.unpack("<hBbBbb", smbus.readBuffer(this.addr, 0xe1, 7))

            compensation.push(temp.shift()) // first two-byte number is dig_h2 (0xe1 / 0xe2)
            compensation.push(temp.shift()) // second single-byte number is dig_h3 (0xe3)

            let reg_e4: number = temp.shift()
            let reg_e5: number = temp.shift()
            let reg_e6: number = temp.shift()

            compensation.push((reg_e5 & 0x0f) | (reg_e4 << 4)) // dig_h4
            compensation.push((reg_e5 >> 4) | (reg_e6 << 4)) // dig_h5

            compensation.push(temp.shift()) // dig_h6 (0xe7)

            this.dig_t1 = compensation.shift()
            this.dig_t2 = compensation.shift()
            this.dig_t3 = compensation.shift()
            this.dig_p1 = compensation.shift()
            this.dig_p2 = compensation.shift()
            this.dig_p3 = compensation.shift()
            this.dig_p4 = compensation.shift()
            this.dig_p5 = compensation.shift()
            this.dig_p6 = compensation.shift()
            this.dig_p7 = compensation.shift()
            this.dig_p8 = compensation.shift()
            this.dig_p9 = compensation.shift()
            compensation.shift() // Dispose of unused byte (0xa0)
            this.dig_h1 = compensation.shift()
            this.dig_h2 = compensation.shift()
            this.dig_h3 = compensation.shift()
            this.dig_h4 = compensation.shift()
            this.dig_h5 = compensation.shift()
            this.dig_h6 = compensation.shift()
        }

        getChipID(): number {
            this.setup()
            return smbus.readBuffer(this.addr, 0xd0, 1)[0]
        }

        update(): void {
            this.setup()
            let raw: Buffer = smbus.readBuffer(this.addr, 0xf7, 8)

            let raw_temp: number = (raw[3] << 12) + (raw[4] << 4) + (raw[5] >> 4)
            let raw_press: number = (raw[0] << 12) + (raw[1] << 4) + (raw[2] >> 4)
            let raw_hum: number = (raw[6] << 8) + raw[7]

            let var1: number = ((((raw_temp>>3) - (this.dig_t1<<1))) * (this.dig_t2)) >> 11;
            let var2: number = (((((raw_temp>>4) - (this.dig_t1)) * ((raw_temp>>4) - (this.dig_t1))) >> 12) * (this.dig_t3)) >> 14;
            let t_fine: number = var1 + var2;
            this.temperature = ((t_fine * 5 + 128) >> 8)
            var1 = (t_fine >> 1) - 64000
            var2 = (((var1 >> 2) * (var1 >> 2)) >> 11) * this.dig_p6
            var2 = var2 + ((var1 * this.dig_p5) << 1)
            var2 = (var2 >> 2) + (this.dig_p4 << 16)
            var1 = (((this.dig_p3 * ((var1 >> 2) * (var1 >> 2)) >> 13) >> 3) + (((this.dig_p2) * var1) >> 1)) >> 18
            var1 = ((32768 + var1) * this.dig_p1) >> 15
            if (var1 == 0) {
                return // avoid exception caused by division by zero
            }
        
            let _p = ((1048576 - raw_press) - (var2 >> 12)) * 3125
            _p = (_p / var1) * 2;
            var1 = (this.dig_p9 * (((_p >> 3) * (_p >> 3)) >> 13)) >> 12
            var2 = (((_p >> 2)) * this.dig_p8) >> 13
            this.pressure = _p + ((var1 + var2 + this.dig_p7) >> 4)

            var1 = t_fine - 76800
            var2 = (((raw_hum << 14) - (this.dig_h4 << 20) - (this.dig_h5 * var1)) + 16384) >> 15
            var1 = var2 * (((((((var1 * this.dig_h6) >> 10) * (((var1 * this.dig_h3) >> 11) + 32768)) >> 10) + 2097152) * this.dig_h2 + 8192) >> 14)
            var2 = var1 - (((((var1 >> 15) * (var1 >> 15)) >> 7) * this.dig_h1) >> 4)
            if (var2 < 0) var2 = 0
            if (var2 > 419430400) var2 = 419430400
            this.humidity = (var2 >> 12)

        }
                
        /*setQNH(qnh: number): void {
            this.qnh = qnh
        }*/

        getTemperature(): number {
            this.update()
            return this.temperature
        }

        getPressure(): number {
            this.update()
            return this.pressure
        }

        getHumidity(): number {
            this.update()
            return this.humidity
        }

        /*getAltitude(): number {
            this.update()
            return this.altitude
        }*/
    }
	let _bme280: bme280 = new bme280(0x76)
	
	let soilMoisture_variable = 0
	
	let sdcard_flag = false
	
	// -------------- A. SD Card Initialization ----------------
    //%blockId=initialize_sdcard
    //%block="Initialize Data Logger [Offline mode - SD Card and OLED]"
    //% weight=91	
	//% blockGap=7
    export function initialize_sdcard(): void {   
		OLED.init(64, 128)	
		OLED.showStringWithNewLine("Offline mode")
		
		serial.redirect(SerialPin.P8, SerialPin.P12, BaudRate.BaudRate9600);		
    }
	
    // -------------- B. WiFi Initialization ----------------
    //%blockId=initialize_wifi
    //%block="Initialize Data Logger [Online mode - WiFi module and OLED]"
    //% weight=90	
	//% blockGap=7
    export function initializeWifi(): void {
        OLED.init(64, 128)
		
		serial.redirect(SerialPin.P8, SerialPin.P12, BaudRate.BaudRate115200);
		
		serial.onDataReceived(serial.delimiters(Delimiters.NewLine), function () {
			OLED.showStringWithNewLine(serial.readLine())
		})

        basic.pause(5000);
    }
	
	// -------------- C. Serial USB Initialization ----------------
    //%blockId=initialize_serial
    //%block="Initialize Data Logger [Computer mode (Read by serial USB) - OLED]"
    //% weight=89
    export function initialize_serial(): void {  
		OLED.init(64, 128)	
		OLED.showStringWithNewLine("Computer mode")
		
		serial.redirect(SerialPin.P8, SerialPin.P12, BaudRate.BaudRate115200);		
    }
	
	/**
     * get ambient light data (lx)
     */
    //% blockId="smarthon_get_light" 
    //% block="Get Light intensity (Lx)"
    //% weight=80
	//% blockGap=7		

    export function getLight(): number {
        return Math.idiv(pins.i2cReadNumber(35, NumberFormat.UInt16BE) * 5, 6)
    }

    //% blockId="smarthon_get_temperature" 
    //% block="Get Temperature (°C)"
    //% weight=79
	//% blockGap=7	

    export function getTemperature(): number {
        return Math.round(_bme280.getTemperature() / 100.0)
    }
	
	//% blockId="smarthon_get_pressure" 
    //% block="Get Pressure (hPa)"
    //% weight=78	
	//% blockGap=7	

    export function getPressure(): number {
        return Math.round(_bme280.getPressure() / 100.0)
    }
	
	//% blockId="smarthon_get_humidity" 
    //% block="Get Humidity (percentage)"
    //% weight=76	
	//% blockGap=7	

    export function getHumidity(): number {
        return Math.round(_bme280.getHumidity() / 1024.0)
    }
	
	//% blockId="smarthon_get_soilmoisture" 
    //% block="Get Soil moisture (percentage)"
    //% weight=75	

    export function getSoilmoisture(): number {
        return soilMoisture_variable;
    }
	
	//% blockId="smarthon_usb"
    //% block="Set LED grow light to intensity %intensity"
    //% intensity.min=0 intensity.max=1023
    //% weight=74	
	//% blockGap=7	
	
    export function TurnUSB(intensity: number): void {
			
		pins.analogWritePin(AnalogPin.P16, intensity);
    }
	
	//% blockId="smarthon_waterpump"
    //% block="Set Water pump to intensity %intensity"
    //% intensity.min=0 intensity.max=1023
    //% weight=73
	//% blockGap=7	
	
    export function TurnWaterpump(intensity: number): void {
			
		pins.analogWritePin(AnalogPin.P1, intensity);
    }
	
	//% blockId="smarthon_humdifier"
    //% block="Set Humdifier to intensity %intensity"
    //% intensity.min=0 intensity.max=1023
    //% weight=72	
	//% blockGap=7	
	
    export function TurnHumdifier(intensity: number): void {
		
		pins.analogWritePin(AnalogPin.P15, intensity);
    }
	
		
	//% blockId="smarthon_plantmotorfan_cw"
    //% block="Set Motor fan clockwisely to intensity %intensity"
    //% intensity.min=0 intensity.max=1023
    //% weight=71	
	//% blockGap=7	
	
    export function TurnMotorCW(intensity: number): void {
			
		//pins.analogWritePin(AnalogPin.P13, intensity);
		serial.writeLine("(AT+pwm?pin=2&intensity="+intensity+")"); 
		basic.pause(1000);
    }
	
	//% blockId="smarthon_plantmotorfan_acw"
    //% block="Set Motor fan anti-clockwisely to intensity %intensity"
    //% intensity.min=0 intensity.max=1023
    //% weight=70
	//% blockGap=7	
	
    export function TurnMotorACW(intensity: number): void {
			
		//pins.analogWritePin(AnalogPin.P14, intensity);
		serial.writeLine("(AT+pwm?pin=0&intensity="+intensity+")");
		basic.pause(1000);
    }
	
	//% blockId="smarthon_plantservo"
    //% block="Set Servo to degree %degree"
    //% intensity.min=0 intensity.max=180
    //% weight=69	
	
    export function TurnServo(intensity: number): void {
			
		pins.servoWritePin(AnalogPin.P2, intensity)
    }
	
	// -------------- 1. WiFi ----------------
    //% blockId=smarthon_set_wifi
	//% block="Set wifi to ssid %ssid| pwd %pwd"   
	//% weight=45
	//%subcategory=More	
    export function setWifi(ssid: string, pwd: string): void {
        serial.writeLine("(AT+wifi?ssid="+ssid+"&pwd="+pwd+")"); 
    }

	// -------------- 2. Cloud ----------------
    //% blockId=smarthon_set_thingspeak
	//% block="Send Thingspeak key* %key|field1 %field1|field2 %field2|field3 %field3"
	//% weight=44
	//% blockGap=7
	//%subcategory=More
    export function sendThingspeak(key: string, field1: number, field2: number, field3: number): void {
        serial.writeLine("(AT+thingspeak?key=" + key+"&field1="+field1+"&field2="+field2+"&field3="+field3+")"); 
    }
	
	// -------------- 3. Connect Azure Cloud ----------------
    //% blockId=smarthon_connect_azure
	//% block="Connect Microsoft Azure IoT Central Scope ID %scopeid|Device ID %deviceid|Primary Key %primarykey"
	//% weight=43
	//% blockGap=7
	//%subcategory=More
    export function connectAzure(scopeid: string, deviceid: string, primarykey: string): void {
        serial.writeLine("(AT+connectAzure?scopeid=" + scopeid+"&deviceid="+deviceid+"&primarykey="+primarykey+")"); 
    }
	
	// -------------- 4. Upload data to Azure Cloud ----------------
    //% blockId=smarthon_upload_azure
	//% block="Upload data to Microsoft Azure IoT Central field1 %field1|field2 %field2|field3 %field3|field4 %field4|field5 %field5"
	//% weight=42	
	//%subcategory=More
    export function uploadDataAzure(field1: number, field2: number, field3: number, field4: number, field5: number): void {
        serial.writeLine("(AT+uploadAzure?field1=" + field1+"&field2="+field2+"&field3="+field3+"&field4="+field4+"&field5="+field5+")"); 
    }

    // -------------- 5. Write data to SD card ----------------
    //% blockId=smarthon_write_sdcard
    //% block="Write data to SD card field 1 %field1|field2 %field2|field3 %field3"
    //% weight=41
    //% blockGap=7
    //%subcategory=More
    export function writeSdCard(field1: number, field2: number, field3: number): void {
		
		if(!sdcard_flag){
			serial.writeLine("Time,Field1,Field2,Field3"); 
			sdcard_flag = true
		}
		
		serial.writeLine(input.runningTime() / 1000 + "," + field1.toString() + "," + field2.toString() + "," + field3.toString()); 
    }
	
	// -------------- 6. Write data to serial ----------------
    //% blockId=smarthon_write_serial
    //% block="Write data to computer via serial USB field 1 %field1|field2 %field2|field3 %field3"
    //% weight=40
    //% blockGap=7
    //%subcategory=More
    export function writeSerial(field1: number, field2: number, field3: number): void {
        serial.writeLine(input.runningTime() / 1000 + "," + field1.toString() + "," + field2.toString() + "," + field3.toString()); 
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