print("Get reading from a MS-360LP PIR motion sensor.  Sensor output is digital logic, and analog voltage.")
--http://www.irtec.com/en/ful/DS-MS360LP-EN-A4_V4.pdf
--Wire ambient light sensor (ALS) output to an analog input, AIN0, with desired pull-down resistor (10kΩ)
--Wire motion sensor output (PIR) output to a digital I/O, FIO2

InputVoltage = 0
NoMotion = 0

LJ.IntervalConfig(0, 1000)           --set interval to 1000 for 1000ms
while true do
  if LJ.CheckInterval(0) then             --interval completed
    InputVoltage = MB.R(0, 3)           --read address 0 (AIN0), type is 3
    print("Ambient light, AIN1: ", InputVoltage, "V")
    --ConvertVoltageToLux(InputVoltage) function not yet made, depends on pull-down resistor (see datasheet link above)
    NoMotion = MB.R(2002, 0)			--read address 2002 (FIO2), type is 0
    if NoMotion == 0 then
      --code response to motion here
      print("Motion Detected!")
    end
  end
end