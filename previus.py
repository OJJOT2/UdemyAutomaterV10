# -*- coding: utf-8 -*-
import sys
import pyperclip
import requests
import sys
import telebot
import time
from pathlib import Path
from bs4 import BeautifulSoup

from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException

script_directory = Path(__file__).parent
profile_path = script_directory / "automation_profile"
chrome_options = webdriver.ChromeOptions()
chrome_options.add_argument(f"--user-data-dir={profile_path}")
# chrome_options.add_argument(
#     r"--user-data-dir=C:\Users\OJJOT\AppData\Local\Google\Chrome\User Data\Default")
# chrome_options.add_argument(r"--profile-directory=Default")
channel_name = "Tst"
# Replace with your actual Telegram Bot Token
BOT_TOKEN = "7649783739:AAEDScFMr9Xek8vM4u-VRc_eTq4ay8unyhg"
CHAT_ID = "5075265669"

bot = telebot.TeleBot(BOT_TOKEN)

head = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.128 Safari/537.36 Edg/89.0.774.77",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9", }
categories = ['all','android', 'angularjs', 'bootstrap', 'c', 'cpp', 'csharp', 'css', 'data-structure', 'debug-test',
              'development-tools', 'django', 'drupal', 'e-commerce', 'ethical-hacking', 'game-development', 'git',
              'hardware', 'html', 'ios', 'java', 'javascript', 'jquery', 'json', 'machine-learning', 'matlab',
              'mobile-development-other', 'mysql', 'nodejs', 'nosql', 'php', 'programming-other', 'python',
              'r-programming', 'react-redux', 'robotics', 'ruby', 'seo', 'software', 'sql', 'system-programming', 'ux',
              'web-development-other', 'wordpress', 'vue', '3d-model', 'after-effects', 'animation', 'graphic-design',
              'photography', 'photoshop', 'premiere-pro', 'video-design', 'aws', 'hosting', 'linux', 'mac',
              'network-security', 'windows', 'windows-server', 'academic', 'blockchain', 'business', 'certification',
              'health-fitness', 'languages', 'lifestyle', 'marketing', 'music', 'office-productivity',
              'personal-development', 'social-media']

Scraping_sources = ['discudemy']



from PySide6.QtCore import (QCoreApplication, QDate, QDateTime, QLocale,
    QMetaObject, QObject, QPoint, QRect,
    QSize, QTime, QUrl, Qt)
from PySide6.QtGui import (QBrush, QColor, QConicalGradient, QCursor,
    QFont, QFontDatabase, QGradient, QIcon,
    QImage, QKeySequence, QLinearGradient, QPainter,
    QPalette, QPixmap, QRadialGradient, QTransform)
from PySide6.QtWidgets import (QApplication, QComboBox, QLabel, QLineEdit,
    QMainWindow, QPushButton, QRadioButton, QSizePolicy,
    QSpinBox, QTextBrowser, QWidget)

class Ui_MainWindow(QMainWindow):

    def __init__(self):
        super().__init__()
        self.setupUi(self)
        self.radio_contact.toggled.connect(self.update_input_fields)
        self.radio_Group.toggled.connect(self.update_input_fields)
        self.radio_Channel.toggled.connect(self.update_input_fields)
        self.pushButton_scrape.clicked.connect(self.update_courses)
        self.pushButton_send_telegram.clicked.connect(self.send_courses_telegram)
        self.pushButton_send_terminal.clicked.connect(self.send_to_terminal)
        self.pushButton_send_whatsapp.clicked.connect(self.send_courses_whatsapp)
        self.pushButton_clear_logs.clicked.connect(self.clean_log)
        self.pushButton_initiate_web.clicked.connect(self.initiate_web)
        self.pushButton_send_poll.clicked.connect(self.send_poll)

    def setupUi(self, MainWindow):
        if not MainWindow.objectName():
            MainWindow.setObjectName(u"MainWindow")
        MainWindow.resize(735, 470)
        self.centralwidget = QWidget(MainWindow)
        self.centralwidget.setObjectName(u"centralwidget")
        self.label_whatsapp = QLabel(self.centralwidget)
        self.label_whatsapp.setObjectName(u"label_whatsapp")
        self.label_whatsapp.setGeometry(QRect(20, 20, 111, 16))
        self.lineEdit_Contact = QLineEdit(self.centralwidget)
        self.lineEdit_Contact.setObjectName(u"lineEdit_Contact")
        self.lineEdit_Contact.setGeometry(QRect(20, 150, 113, 21))
        self.lineEdit_Contact.setEnabled(False)
        self.label_contact = QLabel(self.centralwidget)
        self.label_contact.setObjectName(u"label_contact")
        self.label_contact.setGeometry(QRect(20, 130, 111, 16))
        self.radio_contact = QRadioButton(self.centralwidget)
        self.radio_contact.setObjectName(u"radio_contact")
        self.radio_contact.setGeometry(QRect(30, 40, 89, 20))
        self.radio_Group = QRadioButton(self.centralwidget)
        self.radio_Group.setObjectName(u"radio_Group")
        self.radio_Group.setGeometry(QRect(30, 60, 89, 20))
        self.radio_Channel = QRadioButton(self.centralwidget)
        self.radio_Channel.setObjectName(u"radio_Channel")
        self.radio_Channel.setGeometry(QRect(30, 80, 89, 20))
        self.lineEdit_Group = QLineEdit(self.centralwidget)
        self.lineEdit_Group.setObjectName(u"lineEdit_Group")
        self.lineEdit_Group.setEnabled(False)
        self.lineEdit_Group.setGeometry(QRect(20, 200, 113, 21))
        self.label_Group = QLabel(self.centralwidget)
        self.label_Group.setObjectName(u"label_Group")
        self.label_Group.setGeometry(QRect(20, 180, 111, 16))
        self.lineEdit_Channel = QLineEdit(self.centralwidget)
        self.lineEdit_Channel.setObjectName(u"lineEdit_Channel")
        self.lineEdit_Channel.setGeometry(QRect(20, 250, 113, 21))
        self.lineEdit_Channel.setEnabled(False)
        self.label_Channel = QLabel(self.centralwidget)
        self.label_Channel.setObjectName(u"label_Channel")
        self.label_Channel.setGeometry(QRect(20, 230, 111, 16))
        self.pushButton_send_whatsapp = QPushButton(self.centralwidget)
        self.pushButton_send_whatsapp.setObjectName(u"pushButton_send_whatsapp")
        self.pushButton_send_whatsapp.setGeometry(QRect(20, 320, 111, 24))
        self.label_cources_count = QLabel(self.centralwidget)
        self.label_cources_count.setObjectName(u"label_cources_count")
        self.label_cources_count.setGeometry(QRect(180, 260, 51, 16))
        self.pushButton_scrape = QPushButton(self.centralwidget)
        self.pushButton_scrape.setObjectName(u"pushButton_scrape")
        self.pushButton_scrape.setGeometry(QRect(180, 190, 151, 24))
        self.spinBox_cources = QSpinBox(self.centralwidget)
        self.spinBox_cources.setObjectName(u"spinBox_cources")
        self.spinBox_cources.setGeometry(QRect(280, 260, 51, 22))
        self.spinBox_cources.setValue(1)
        self.comboBox_Category = QComboBox(self.centralwidget)
        self.comboBox_Category.addItems(categories)
        self.comboBox_Category.setObjectName(u"comboBox_Category")
        self.comboBox_Category.setGeometry(QRect(180, 110, 151, 22))
        self.spinBox_pages = QSpinBox(self.centralwidget)
        self.spinBox_pages.setObjectName(u"spinBox_pages")
        self.spinBox_pages.setGeometry(QRect(281, 150, 51, 22))
        self.spinBox_pages.setValue(1)
        self.label_page_count = QLabel(self.centralwidget)
        self.label_page_count.setObjectName(u"label_page_count")
        self.label_page_count.setGeometry(QRect(180, 150, 51, 16))
        self.pushButton_send_terminal = QPushButton(self.centralwidget)
        self.pushButton_send_terminal.setObjectName(u"pushButton_send_terminal")
        self.pushButton_send_terminal.setGeometry(QRect(20, 360, 111, 24))
        self.pushButton_clear_logs = QPushButton(self.centralwidget)
        self.pushButton_clear_logs.setObjectName(u"pushButton_clear_logs")
        self.pushButton_clear_logs.setGeometry(QRect(20, 400, 111, 24))
        self.textBrowser_logger = QTextBrowser(self.centralwidget)
        self.textBrowser_logger.setObjectName(u"textBrowser_logger")
        self.textBrowser_logger.setEnabled(True)
        self.textBrowser_logger.setGeometry(QRect(380, 50, 341, 371))
        self.label_selection = QLabel(self.centralwidget)
        self.label_selection.setObjectName(u"label_selection")
        self.label_selection.setGeometry(QRect(180, 230, 111, 16))
        self.comboBox_source = QComboBox(self.centralwidget)
        self.comboBox_source.setObjectName(u"comboBox_source")
        self.comboBox_source.addItems(Scraping_sources)
        self.comboBox_source.setGeometry(QRect(180, 50, 151, 22))
        self.label_source = QLabel(self.centralwidget)
        self.label_source.setObjectName(u"label_source")
        self.label_source.setGeometry(QRect(180, 30, 111, 16))
        self.label_Category = QLabel(self.centralwidget)
        self.label_Category.setObjectName(u"label_Category")
        self.label_Category.setGeometry(QRect(180, 90, 111, 16))
        self.label_Telegramapo = QLabel(self.centralwidget)
        self.label_Telegramapo.setObjectName(u"label_Telegramapo")
        self.label_Telegramapo.setGeometry(QRect(180, 290, 111, 16))
        self.lineEdit_telegramapi = QLineEdit(self.centralwidget)
        self.lineEdit_telegramapi.setObjectName(u"lineEdit_telegramapi")
        self.lineEdit_telegramapi.setGeometry(QRect(180, 310, 151, 21))
        self.pushButton_send_telegram = QPushButton(self.centralwidget)
        self.pushButton_send_telegram.setObjectName(u"pushButton_send_telegram")
        self.pushButton_send_telegram.setGeometry(QRect(180, 400, 151, 24))
        self.lineEdit_chatid = QLineEdit(self.centralwidget)
        self.lineEdit_chatid.setObjectName(u"lineEdit_chatid")
        self.lineEdit_chatid.setGeometry(QRect(180, 370, 151, 21))

        self.label_Group_chatid = QLabel(self.centralwidget)
        self.label_Group_chatid.setObjectName(u"label_Group_chatid")
        self.label_Group_chatid.setGeometry(QRect(180, 350, 111, 16))
        self.label_logs = QLabel(self.centralwidget)
        self.label_logs.setObjectName(u"label_logs")
        self.label_logs.setGeometry(QRect(380, 30, 111, 16))
        self.pushButton_send_poll = QPushButton(self.centralwidget)
        self.pushButton_send_poll.setObjectName(u"pushButton_send_poll")
        self.pushButton_send_poll.setGeometry(QRect(20, 280, 111, 24))
        self.pushButton_initiate_web = QPushButton(self.centralwidget)
        self.pushButton_initiate_web.setObjectName(u"pushButton_initiate_web")
        self.pushButton_initiate_web.setGeometry(QRect(20, 440, 111, 24))

        MainWindow.setCentralWidget(self.centralwidget)

        self.retranslateUi(MainWindow)

        QMetaObject.connectSlotsByName(MainWindow)


    def retranslateUi(self, MainWindow):
        MainWindow.setWindowTitle(QCoreApplication.translate("MainWindow", u"TeleBot V8", None))
        self.label_whatsapp.setText(QCoreApplication.translate("MainWindow", u"Whatsapp", None))
        self.lineEdit_Contact.setText(QCoreApplication.translate("MainWindow", u"+201080482081", None))
        self.label_contact.setText(QCoreApplication.translate("MainWindow", u"Contact number:", None))
        self.radio_contact.setText(QCoreApplication.translate("MainWindow", u"Contact", None))
        self.radio_Group.setText(QCoreApplication.translate("MainWindow", u"Group", None))
        self.radio_Channel.setText(QCoreApplication.translate("MainWindow", u"Channel", None))
        self.lineEdit_Group.setText(QCoreApplication.translate("MainWindow", u"Fprt8onTshi53P5z9CyE4j", None))
        self.label_Group.setText(QCoreApplication.translate("MainWindow", u"Group ID:", None))
        self.lineEdit_Channel.setText(QCoreApplication.translate("MainWindow", u"Udemy Free Courses - Daily", None))
        self.label_Channel.setText(QCoreApplication.translate("MainWindow", u"Channel Name", None))
        self.pushButton_send_whatsapp.setText(QCoreApplication.translate("MainWindow", u"Send To whatsapp", None))
        self.label_cources_count.setText(QCoreApplication.translate("MainWindow", u"Courses:", None))
        self.pushButton_scrape.setText(QCoreApplication.translate("MainWindow", u"Scrape", None))
        self.label_page_count.setText(QCoreApplication.translate("MainWindow", u"Pages:", None))
        self.pushButton_send_terminal.setText(QCoreApplication.translate("MainWindow", u"Send to Terminal", None))
        self.pushButton_clear_logs.setText(QCoreApplication.translate("MainWindow", u"Clear Logs", None))
        self.label_selection.setText(QCoreApplication.translate("MainWindow", u"Selection:", None))
        self.label_source.setText(QCoreApplication.translate("MainWindow", u"Scraping Source:", None))
        self.label_Category.setText(QCoreApplication.translate("MainWindow", u"Category:", None))
        self.label_Telegramapo.setText(QCoreApplication.translate("MainWindow", u"Telegram API:", None))
        self.lineEdit_telegramapi.setText(QCoreApplication.translate("MainWindow", u"7649783739:AAEDScFMr9Xek8vM4u-VRc_eTq4ay8unyhg", None))
        self.pushButton_send_telegram.setText(QCoreApplication.translate("MainWindow", u"Send To Telegram", None))
        self.lineEdit_chatid.setText(QCoreApplication.translate("MainWindow", u"5075265669", None))
        self.label_Group_chatid.setText(QCoreApplication.translate("MainWindow", u"Chat ID:", None))
        self.label_logs.setText(QCoreApplication.translate("MainWindow", u"Logs:", None))
        self.pushButton_send_poll.setText(QCoreApplication.translate("MainWindow", u"Send Poll", None))
        self.pushButton_initiate_web.setText(QCoreApplication.translate("MainWindow", u"Initiate WA Web", None))
    def update_input_fields(self):
        self.lineEdit_Contact.setEnabled(self.radio_contact.isChecked())
        self.lineEdit_Group.setEnabled(self.radio_Group.isChecked())
        self.lineEdit_Channel.setEnabled(self.radio_Channel.isChecked())
    def update_courses(self):
        try:
            site = self.comboBox_source.currentText()
            cat = self.comboBox_Category.currentText()
            pages_count = self.spinBox_pages.value()

            if site == "discudemy":
                self.udemy_links(cat, int(pages_count))

            else:
                pass


        except Exception as e:
            self.logger(f"error: {e}")

    def logger(self, log):
        self.textBrowser_logger.insertPlainText(f"{log}\n------------------------\n")

    def clean_log(self):
        self.textBrowser_logger.setPlainText("")

    def external_page_scrap(self, url, max_pages):
        try:
            courses = []
            courses2 = []
            for page in range(int(max_pages)):
                self.logger(f"Page: {page}")
                if self.comboBox_Category.currentText()=="all":
                    current_url = f"https://www.discudemy.com/all/{page + 1}"
                else:
                    current_url = f"https://www.discudemy.com/category/{url}/{page + 1}"
                try:
                    r = requests.get(current_url, headers=head)
                except Exception as e:
                    self.logger(f"Error: {e}")
                    return False
                self.logger(current_url)

                soup = BeautifulSoup(r.content, "html.parser")
                courses_got = soup.find_all("section", "card")
                self.logger(f"Page {page + 1} Done with {len(courses_got)} courses got")
                for cc in courses_got:
                    courses.append(cc)

            for link in range(len(courses)):
                try:
                    c_link = courses[link].find('a', class_="card-header").get("href")
                    c_link = c_link.replace(str('/' + c_link.split("/")[3] + '/'), "/go/")
                    self.logger(c_link)
                    courses2.append(c_link)
                except AttributeError as x:
                    self.logger(f"error;{x}")
            self.logger(f"all courses = {len(courses2)}")
            return courses2
        except Exception as e:
            self.logger(f"error: {e}")

    def internal_page_scrap(self, link):
        try:
            main1 = requests.get(link, headers=head)
            main2 = BeautifulSoup(main1.content, "html.parser")
            Course_link = main2.find("div", class_="ui segment").a["href"]
            return Course_link
        except Exception as e:
            self.logger(f"error: {e}")

    def udemy_links(self, category, pages):
        try:
            udemy_links = []
            courses_list = self.external_page_scrap(category, pages)
            self.logger(courses_list)
            self.logger("One step left")
            vv = 0
            with open('Courses_list.txt', 'w') as file:
                file.write('')
            for x in courses_list:
                udemy_links.append(self.internal_page_scrap(x))
                with open("Courses_list.txt", "a") as file:
                    file.writelines(udemy_links[-1])
                    file.write("\n")
                    file.close()
                vv += 1
                self.logger(f"Process: {vv}/{len(courses_list)}.")
            self.logger(udemy_links)
            self.logger(f"Done with {len(udemy_links)} coueses")
            self.spinBox_cources.setValue(len(udemy_links))
        except Exception as e:
            self.logger(f"error: {e}")

    def send_to_terminal(self):
        try:

            with open('Courses_list.txt', 'r') as file:
                links = file.readlines()
            links = [link.strip() for link in links]
            no_courses = len(links) if int(self.spinBox_cources.value()) >= len(links) else int(
                self.spinBox_cources.value())

            for link in links[:no_courses]:
                self.logger(self.formated_message(link))
        except Exception as e:
            self.logger(f"error: {e}")

    def extract_data(self, url):
        try:
            response = requests.get(url)
            soup = BeautifulSoup(response.content, 'html.parser')
            try:
                name = soup.find("h1", class_=["ud-heading-xxl", "clp-lead__title", "clp-lead__title--small"]).get_text(
                    strip=True)
            except IndexError as e:
                name = "Null"

            try:
                disc = soup.find("div", class_=["ud-text-lg", "clp-lead__headline"]).get_text(strip=True)
            except IndexError as e:
                disc = "Null"

            try:
                category = \
                    soup.find("div", class_=["course-landing-page__main-content", "course-landing-page__topic-menu",
                                             "dark-background-inner-text-container"]).find_all("a",
                                                                                               class_="ud-heading-sm")[
                        1].get_text(strip=True)
            except IndexError as e:
                category = "Null"

            try:
                rate = soup.find("span", class_=["ud-heading-sm", "star-rating-module--rating-number--2-qA2"]).get_text(
                    strip=True)

            except IndexError as e:
                rate = "Null"
            return [name, category, disc, rate]
        except Exception as e:
            self.logger(f"error: {e}")

    def formated_message(self, url):
        try:
            name, catelogy, discription, rate = self.extract_data(url)
            message = f"""
            🎓 *{name}*

        📂 *Category:* {catelogy}.
        📖 *Description:* {discription}.
        ⭐ *Rating:* {rate} .
        💲 *Price:* FREE!

            🔗 *Enroll Now:* {url}
            
            
        🔥 *Channel link*: https://whatsapp.com/channel/0029Vay6zUG4SpkQ1CRZvw2s
        
        🔥 *Group link*: https://chat.whatsapp.com/Fprt8onTshi53P5z9CyE4j
        
            """

            return message
        except Exception as e:
            self.logger(f"error: {e}")

    def send_courses_telegram(self):
        try:
            bot = telebot.TeleBot(self.lineEdit_telegramapi.text())
            no_courses = int(self.spinBox_cources.value())
            with open('Courses_list.txt', 'r') as file:
                links = file.readlines()
            links = [link.strip() for link in links]

            no_courses = len(links) if no_courses >= len(links) else no_courses

            for link in links[:no_courses]:
                try:
                    bot.send_message(CHAT_ID, self.formated_message(link), parse_mode="Markdown")
                    self.logger("Message sent to telegram")
                except Exception as e:
                    self.logger("error: " + e)
        except Exception as e:
            self.logger(f"error: {e}")

    def send_courses_whatsapp(self):
        with open('Courses_list.txt', 'r') as file:
            links = file.readlines()
        links = [link.strip() for link in links]
        try:
            channel_name = self.lineEdit_Channel.text()
            self.send_to_whats(channel_name, links)
        except Exception as e:
            self.logger(f"error: {e}")

    def send_to_whats(self, channel_name, links: list):
        try:
            driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=chrome_options)
            driver.get("https://web.whatsapp.com")
        except Exception as e:
            self.logger(f"Error {e}")
            return 0

        #time.sleep(10)

        try:
            wait = WebDriverWait(driver, 60)
            channels_locator = (By.CSS_SELECTOR, 'button[aria-label="Channels"]')
            channels_btn = wait.until(EC.element_to_be_clickable(channels_locator))
            channels_btn.click()
        except TimeoutException:
            print("❌ The Channels button did not become clickable within the time limit.")

        # channels_btn = driver.find_element("css selector", 'button[aria-label="Channels"]')
        # channels_btn.click()
        time.sleep(2)

        try:
            wait = WebDriverWait(driver, 60)
            channel_locator = (By.CSS_SELECTOR,f'span[title="{channel_name}"]')
            channels_btn = wait.until(EC.element_to_be_clickable(channel_locator))
            channels_btn.click()
        except TimeoutException:
            print("❌ The Channel name did not become clickable within the time limit.")

        #chat = driver.find_element(By.CSS_SELECTOR,
         #                          f'span[title="{channel_name}"]')  # Udemy Free Courses - Daily

        self.logger(links)
        no_courses = len(links) if int(self.spinBox_cources.value()) >= len(links) else int(
            self.spinBox_cources.value())
        for link in links[:no_courses]:
            try:
                message = self.formated_message(link)
                pyperclip.copy(message)
                print(message)
                time.sleep(1)
                try:
                    wait2 = WebDriverWait(driver, 60)
                    message_box = driver.find_element(By.CSS_SELECTOR, 'div[aria-placeholder="Type an update"]')
                    channels_btn = wait2.until(EC.element_to_be_clickable(message_box))
                    channels_btn.click()
                except TimeoutException:
                    print("❌ The Channel name did not become clickable within the time limit.")

                # message_box = driver.find_element(By.CSS_SELECTOR, 'div[aria-label="Type an update"]')
                # message_box.click()
                self.logger("clicked")
                message_box.send_keys(Keys.CONTROL, 'v')
                time.sleep(2)
                message_box.send_keys(Keys.ENTER)
                self.logger(f"Message sent to {channel_name}")
            except Exception as e:
                self.logger(f"Error: {e}")
            time.sleep(1)
        driver.quit()

    def initiate_web(self):
        try:
            self.driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=chrome_options)
            self.driver.get("https://web.whatsapp.com")
        except Exception as e:
            self.logger(f"Error {e}")
            return 0

    def send_poll(self):
        options = [
            "🌐 Web Development",
            "🐍 Python Programming",
            "🤖 Artificial Intelligence & Machine Learning",
            "📱 Mobile App Development",
            "📈 Business & Marketing",
            "🎨 Graphic Design",
            "🎬 Video Editing & Animation",
            "🔒 Cybersecurity & Ethical Hacking"
        ]

        channels_btn = self.driver.find_element("css selector", 'button[title="Attach"]')
        channels_btn.click()
        time.sleep(1)
        poll_btn = self.driver.find_element(By.XPATH, "//span[contains(text(), 'Poll')]")
        poll_btn.click()
        time.sleep(1)
        for x in range(9):
            self.driver.switch_to.active_element.send_keys(Keys.TAB)
        self.logger("clicked")
        pyperclip.copy("Tomorrow Courses? 🤔")
        self.driver.switch_to.active_element.send_keys(Keys.CONTROL, 'v')
        for x in options:
            self.driver.switch_to.active_element.send_keys(Keys.TAB)
            self.driver.switch_to.active_element.send_keys(Keys.TAB)
            pyperclip.copy(x)
            self.driver.switch_to.active_element.send_keys(Keys.CONTROL, 'v')
        time.sleep(1)
        send_button = self.driver.find_element(By.XPATH, "//div[@aria-label='Send']")
        send_button.click()  # Click the button (optional)

if __name__=="__main__":
    app = QApplication(sys.argv)
    mainWindow = Ui_MainWindow()
    mainWindow.show()
    sys.exit(app.exec())