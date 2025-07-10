import network
import time
import socket
from media.sensor import *
from media.display import *
from media.media import *
import _thread  # 导入线程模块

# WiFi 配置
SSID = "Web"
PASSWORD = "88888888"

# TCP 服务端配置
SERVER_IP = "192.168.43.88"  # 服务端 IP 地址
SERVER_PORT = 80  # 服务端端口

sensor_id = 2
sensor = None

# 线程控制标志
running = True
wifi_connected = False
camera_ready = False
tcp_connected = False
client_socket = None

# 线程锁
lock = _thread.allocate_lock()

def connect_wifi_thread():
    """WiFi连接线程"""
    global wifi_connected
    try:
        sta = network.WLAN(network.STA_IF)
        if not sta.active():
            sta.active(True)
        print("WiFi模块激活状态:", sta.active())

        sta.connect(SSID, PASSWORD)
        while not sta.isconnected() and running:
            time.sleep(1)

        if running:
            ip_info = sta.ifconfig()
            print(f"连接成功，IP地址: {ip_info[0]}")
            with lock:
                wifi_connected = True
    except Exception as e:
        print(f"WiFi连接异常: {e}")

def setup_camera_thread():
    """摄像头设置线程"""
    global sensor, camera_ready
    try:
        sensor = Sensor(id=sensor_id)
        sensor.reset()
        sensor.set_framesize(Sensor.VGA, chn=CAM_CHN_ID_0)  # 使用较低的分辨率 640x480
        sensor.set_pixformat(Sensor.RGB888, chn=CAM_CHN_ID_0)
        Display.init(Display.VIRT, width=640, height=480, to_ide=True)  # 适应新分辨率
        MediaManager.init()
        sensor.run()
        print("摄像头初始化成功")
        with lock:
            camera_ready = True
    except Exception as e:
        print(f"摄像头初始化失败: {e}")

def connect_tcp_thread():
    """TCP连接线程"""
    global tcp_connected, client_socket
    try:
        # 等待WiFi连接成功
        while running and not wifi_connected:
            time.sleep(0.5)

        if not running:
            return

        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.connect((SERVER_IP, SERVER_PORT))
        print(f"成功连接到服务器 {SERVER_IP}:{SERVER_PORT}")
        with lock:
            client_socket = sock
            tcp_connected = True
    except Exception as e:
        print(f"连接服务器失败: {e}")

def capture_and_send_thread():
    """图像捕获和发送线程"""
    global running

    # 等待摄像头和TCP连接就绪
    while running and (not camera_ready or not tcp_connected):
        time.sleep(0.5)

    if not running:
        return

    try:
        while running:
            img = sensor.snapshot(chn=CAM_CHN_ID_0)
            if img:
#                print("图像捕获成功")

                # 使用 to_jpeg() 方法将图像转换为 JPEG 格式字节流
                try:
                    image_data = img.to_jpeg(quality=50)  # 压缩图像，降低质量来减少数据大小
                    send_image(client_socket, image_data)
                except Exception as e:
                    print(f"图像编码失败: {e}")
            else:
                print("图像捕获失败")

            time.sleep(0.1)  # 延迟以减少CPU负载
    except Exception as e:
        print(f"图像捕获线程异常: {e}")
        running = False

def send_image(client_socket, image_data):
    """发送图像数据流"""
    try:
        image_len = len(image_data)
        client_socket.sendall(image_len.to_bytes(4, 'big'))  # 发送图像长度
        client_socket.sendall(image_data)  # 发送图像数据
#        print("图像数据已发送")
    except Exception as e:
        print(f"发送图像数据失败: {e}")
        global running
        running = False  # 发送失败时停止程序

def receive_tcp_thread():
    """TCP消息接收线程"""
    global running, client_socket

    # 等待TCP连接就绪
    while running and not tcp_connected:
        time.sleep(0.5)

    if not running:
        return

    try:
        buffer_size = 1024  # 接收缓冲区大小
        while running:
            try:
                # 非阻塞方式接收数据
                client_socket.setblocking(False)
                try:
                    data = client_socket.recv(buffer_size)
                    if data:
                        print(f"收到服务器消息: {data.decode('utf-8', 'ignore')}")
                        # 这里可以添加对接收消息的处理逻辑
                except OSError as e:
                    # 非阻塞模式下没有数据可读会抛出异常
                    pass

                time.sleep(0.1)  # 短暂休眠，避免CPU占用过高
            except Exception as e:
                print(f"接收消息异常: {e}")
                if "Connection closed" in str(e):
                    running = False
                    break
    except Exception as e:
        print(f"接收线程异常: {e}")
        running = False


def main():
    """主程序"""
    global running

    try:
        # 启动WiFi连接线程
        _thread.start_new_thread(connect_wifi_thread, ())

        # 启动摄像头初始化线程
        _thread.start_new_thread(setup_camera_thread, ())

        # 启动TCP连接线程
        _thread.start_new_thread(connect_tcp_thread, ())

        # 等待必要的初始化完成
        while running and not (wifi_connected and camera_ready and tcp_connected):
            time.sleep(0.5)

        if not running:
            print("初始化失败，程序退出")
            return

        # 启动图像捕获和发送线程
        _thread.start_new_thread(capture_and_send_thread, ())


        # 启动TCP消息接收线程
        _thread.start_new_thread(receive_tcp_thread, ())

        # 主线程保持运行，直到收到退出信号
        while running:
            time.sleep(1)

    except KeyboardInterrupt:
        print("用户停止程序")
    except Exception as e:
        print(f"主线程异常: {e}")
    finally:
        running = False
        time.sleep(1)  # 给其他线程一些时间来退出
        if client_socket:
            try:
                client_socket.close()
            except:
                pass
        print("程序已退出")

if __name__ == "__main__":
    main()
