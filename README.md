# Task Master

MASTER PROMPT

تبدیل Task Manager مرجع به اپلیکیشن Native Android کاملاً آفلاین

نقش شما

تو در این پروژه به‌عنوان یک تیم کامل مهندسی نرم‌افزار عمل می‌کنی:

Senior Android Engineer

Senior Kotlin Developer

Software Architect

Mobile UI/UX Engineer

Database Architect

Offline-First Application Engineer

QA Engineer

Security Engineer

وظیفه تو این است که پروژه Task Manager موجود در Repository زیر را ابتدا به‌صورت کامل تحلیل کنی:

Repository:

https://github.com/hazratia25-ctrl/Task-Manager

مسیر پروژه مرجع:

remix_-task-manager

سپس قابلیت‌ها، User Flowها، منطق کسب‌وکار، صفحات، Componentها، تعاملات و تجربه کاربری موجود در پروژه مرجع را استخراج کرده و همان محصول را به یک اپلیکیشن Native Android، قابل نصب، مستقل و کاملاً Offline-First تبدیل کنی.

بخش اول — قانون اساسی پروژه

این پروژه دیگر نباید یک Website باشد.

این پروژه نباید:

Web App باشد

PWA باشد

WebView Wrapper باشد

سایت را داخل APK نمایش دهد

به Browser وابسته باشد

به localhost وابسته باشد

برای عملکرد اصلی به Node.js نیاز داشته باشد

برای عملکرد اصلی به Express نیاز داشته باشد

برای عملکرد اصلی به Supabase نیاز داشته باشد

برای عملکرد اصلی به API اینترنتی نیاز داشته باشد

برای عملکرد اصلی به Google Gemini API نیاز داشته باشد

خروجی نهایی باید یک:

Native Android Application

واقعی باشد که به‌صورت APK روی گوشی Android نصب شود.

کاربر باید بتواند گوشی را روی Airplane Mode قرار دهد و همچنان تمام قابلیت‌های اصلی برنامه را استفاده کند.

بخش دوم — تحلیل پروژه مرجع

قبل از نوشتن کد Android، ابتدا Repository مرجع را Analyze کن.

پروژه مرجع فعلی یک پروژه مبتنی بر React/Vite/TypeScript است و در وابستگی‌های آن مواردی مانند:

React

Vite

TypeScript

Tailwind CSS

Lucide React

Motion

Jalaali

Supabase

Google Gemini SDK

Express

وجود دارد.

این تکنولوژی‌ها را مستقیماً به Android منتقل نکن.

به‌جای آن، قابلیت‌های واقعی آن‌ها را استخراج و معادل Native آن‌ها را پیاده‌سازی کن.

اصل کار:

Reference Web Application
        ↓
Repository Analysis
        ↓
Feature Extraction
        ↓
Business Logic Extraction
        ↓
UI/UX Analysis
        ↓
Feature Mapping
        ↓
Native Android Architecture
        ↓
Offline-First Implementation


بخش سوم — اصل Feature Parity

هیچ قابلیت کاربردی پروژه مرجع نباید در نسخه Android حذف شود.

هدف:

100% Functional Feature Parity

است.

اما Feature Parity به معنی کپی کردن تکنولوژی Web نیست.

یعنی:

React Component
        ↓
Jetpack Compose Component

React State
        ↓
ViewModel + StateFlow

Supabase
        ↓
Room + SQLite

Supabase Auth
        ↓
Local Profile / Local Authentication

Browser Local Storage
        ↓
DataStore

JavaScript Date Logic
        ↓
Kotlin Date/Time API

Jalaali JS
        ↓
Jalali Calendar Library for Android

Gemini API
        ↓
Offline AI-ready Architecture


بخش چهارم — تکنولوژی نهایی

از Stack زیر استفاده کن.

زبان

Kotlin

UI

Jetpack Compose

Design System

Material 3

Architecture

Clean Architecture

MVVM

Repository Pattern

Use Case Pattern

Single Source of Truth

Dependency Injection

Hilt

Local Database

Room

SQLite

State Management

StateFlow

SharedFlow

Kotlin Coroutines

Navigation

Navigation Compose

Preferences

DataStore

Background Processing

WorkManager

Notifications

Android Local Notifications

Date & Time

java.time

Persian Calendar

Jalali Calendar Support

Charts

یک کتابخانه Native و پایدار برای نمودارهای Android انتخاب کن.

Testing

JUnit

AndroidX Test

Compose UI Test

MockK

بخش پنجم — معماری کلان

معماری برنامه باید به شکل زیر باشد:

                Android UI
             Jetpack Compose
                    │
                    ▼
              ViewModel
                    │
                    ▼
                Use Cases
                    │
                    ▼
               Repository
                    │
          ┌─────────┴─────────┐
          ▼                   ▼
     Room Database         DataStore
          │                   │
          ▼                   ▼
       SQLite             Preferences


برای عملیات Background:

WorkManager
     │
     ├── Deadline Reminder
     ├── Overdue Check
     ├── Notification Scheduling
     └── Local Maintenance


بخش ششم — ساختار پروژه

ساختار پروژه را به شکل Modular و قابل نگهداری طراحی کن.

ساختار پیشنهادی:

app/
│
├── data/
│   ├── local/
│   │   ├── database/
│   │   ├── dao/
│   │   ├── entity/
│   │   └── converter/
│   │
│   ├── repository/
│   └── mapper/
│
├── domain/
│   ├── model/
│   ├── repository/
│   └── usecase/
│
├── presentation/
│   ├── navigation/
│   ├── theme/
│   │
│   ├── dashboard/
│   ├── tasks/
│   ├── kanban/
│   ├── calendar/
│   ├── categories/
│   ├── tags/
│   ├── analytics/
│   ├── notifications/
│   ├── profile/
│   └── settings/
│
├── worker/
│
├── di/
│
└── core/
    ├── common/
    ├── extensions/
    ├── utils/
    └── security/


در صورت نیاز، پروژه را به Multi-Module Architecture ارتقا بده:

:app
:core
:core:ui
:core:database
:core:domain
:feature:dashboard
:feature:tasks
:feature:calendar
:feature:analytics
:feature:settings


اگر اندازه پروژه این کار را توجیه می‌کند، Multi-Module Architecture را ترجیح بده.

بخش هفتم — دیتابیس محلی

تمام داده‌های اصلی برنامه باید در Room ذخیره شوند.

حداقل Entityهای زیر را طراحی کن:

TaskEntity

id
title
description
status
priority
categoryId
dueDate
createdAt
updatedAt
completedAt
isCompleted


CategoryEntity

id
name
color
createdAt
updatedAt


TagEntity

id
name
createdAt


TaskTagCrossRef

taskId
tagId


NotificationEntity

id
taskId
type
title
message
isRead
createdAt


UserProfileEntity

id
name
email
avatarUri
createdAt
updatedAt


AppSettingsEntity یا DataStore

برای:

Theme

Notification Settings

Calendar Preference

Language

Reminder Settings

بخش هشتم — وضعیت Task

وضعیت‌ها:

TODO
IN_PROGRESS
COMPLETED


اولویت‌ها:

LOW
MEDIUM
HIGH


تمام این موارد باید Type-Safe باشند.

بخش نهم — CRUD

پیاده‌سازی کامل:

CREATE
READ
UPDATE
DELETE


برای Task.

کاربر بتواند:

Task ایجاد کند

Task مشاهده کند

Task ویرایش کند

Task حذف کند

Task تکمیل کند

Task بازگشایی کند

تمام تغییرات باید در Room Persist شوند.

بعد از بستن برنامه و باز کردن مجدد:

هیچ داده‌ای نباید از بین برود.

بخش دهم — Dashboard

Dashboard اصلی برنامه را Native بازطراحی کن.

نمایش:

Total Tasks

Completed Tasks

Pending Tasks

In Progress Tasks

Overdue Tasks

High Priority Tasks

Completion Rate

بخش‌های:

Recent Tasks

Upcoming Tasks

Important Tasks

Overdue Tasks

را نمایش بده.

تمام آمار باید از Room Query شود.

هیچ آمار Hardcoded نباشد.

بخش یازدهم — Task Management

صفحه اصلی Taskها شامل:

لیست Taskها

جست‌وجو

Filter

Sort

Status

Priority

Category

Tags

باشد.

از LazyColumn برای لیست‌ها استفاده کن.

بخش دوازدهم — Search

Search باید کاملاً Local باشد.

جست‌وجو بر اساس:

عنوان

توضیحات

انجام شود.

از Debounce استفاده کن.

Queryهای Room را بهینه کن.

بخش سیزدهم — Filter

Filterهای زیر را پیاده‌سازی کن:

همه

انجام‌نشده

در حال انجام

تکمیل‌شده

اولویت بالا

اولویت متوسط

اولویت پایین

عقب‌افتاده

امروز

این هفته

بدون Deadline

امکان ترکیب چند Filter فراهم باشد.

بخش چهاردهم — Sorting

مرتب‌سازی:

جدیدترین

قدیمی‌ترین

آخرین تغییر

بالاترین اولویت

نزدیک‌ترین Deadline

وضعیت

بخش پانزدهم — Kanban

یک Kanban Board Native ایجاد کن.

ستون‌ها:

TODO
IN_PROGRESS
COMPLETED


Task Cardها باید قابل Drag & Drop باشند.

هنگام جابه‌جایی:

Drag
↓
Optimistic UI Update
↓
ViewModel
↓
Use Case
↓
Repository
↓
Room


اگر ذخیره‌سازی شکست خورد:

Rollback UI State
+
Show Error


بخش شانزدهم — Calendar

یک Calendar Native ایجاد کن.

قابلیت‌ها:

نمایش ماه

انتخاب روز

نمایش Taskهای روز

ایجاد Task در تاریخ انتخابی

ویرایش Task

مشاهده Deadline

Taskهای:

امروز

نزدیک به Deadline

Overdue

Completed

را به‌صورت بصری متمایز کن.

بخش هفدهم — تقویم شمسی

با توجه به استفاده پروژه مرجع از jalaali-js، نسخه Android باید قابلیت تقویم شمسی را حفظ کند.

پشتیبانی:

تاریخ شمسی

تبدیل شمسی به میلادی

تبدیل میلادی به شمسی

نمایش ماه‌های شمسی

انتخاب تاریخ شمسی

Deadline شمسی

در Database تاریخ‌ها را به‌صورت استاندارد ذخیره کن:

Instant / UTC


در UI:

Jalali / Persian Calendar


نمایش بده.

بخش هجدهم — Category

کاربر بتواند:

Category ایجاد کند

Category ویرایش کند

Category حذف کند

هر Category:

Name
Color


داشته باشد.

بخش نوزدهم — Tag

سیستم Tag را پیاده‌سازی کن.

پشتیبانی از:

ایجاد Tag

حذف Tag

اتصال Tag به Task

حذف Tag از Task

Filter بر اساس Tag

بخش بیستم — Notifications

تمام Notificationها Local باشند.

بدون Internet.

Notificationهای زیر:

نزدیک شدن Deadline

رسیدن Deadline

Overdue شدن Task

با WorkManager مدیریت شوند.

برای Android 13+ Notification Permission را مدیریت کن.

Notification Channel ایجاد کن.

بخش بیست‌ویکم — Notification Center

صفحه Notifications:

لیست اعلان‌ها

Read

Unread

Mark as Read

Mark All as Read

Delete

Notification Badge نمایش بده.

بخش بیست‌ودوم — Analytics

Analytics کاملاً Local باشد.

نمایش:

تعداد Taskها

Completion Rate

Status Distribution

Priority Distribution

Created Tasks

Completed Tasks

Overdue Tasks

نمودارها از داده Room ساخته شوند.

بخش بیست‌وسوم — Gemini / AI

پروژه مرجع وابستگی به Google Gemini دارد.

اما نسخه Android باید Offline-First باشد.

بنابراین Core Functionality نباید به Gemini وابسته باشد.

معماری را طوری طراحی کن که:

AI Service Interface
        │
        ├── Offline Implementation
        │
        └── Optional Online Gemini Implementation


در حالت پیش‌فرض:

Offline Mode = ON


باشد.

اگر در آینده کاربر اینترنت داشت، بتوان قابلیت‌های AI را به‌صورت Optional فعال کرد.

اما این قابلیت‌ها نباید برای مدیریت Task ضروری باشند.

در صورت عدم وجود اینترنت:

Task Management

Search

Filter

Calendar

Analytics

Notification

باید 100% کار کنند.

بخش بیست‌وچهارم — Profile

Profile محلی ایجاد کن.

در اولین اجرای برنامه:

Welcome
↓
Create Local Profile
↓
Name
↓
Optional Email
↓
Avatar
↓
Start


پروفایل در Room ذخیره شود.

بخش بیست‌وپنجم — Authentication

چون برنامه Offline است، Login آنلاین اجباری نباشد.

Local Profile کافی است.

اما معماری را طوری طراحی کن که در آینده قابلیت:

Local Authentication
Cloud Authentication


قابل اضافه شدن باشد.

بخش بیست‌وششم — Supabase

Supabase موجود در پروژه مرجع را مستقیماً استفاده نکن.

نسخه Android باید:

Room + SQLite


داشته باشد.

Supabase فقط در صورت طراحی قابلیت Sync آینده به‌عنوان Optional Integration در نظر گرفته شود.

هیچ Core Feature نباید به Supabase وابسته باشد.

بخش بیست‌وهفتم — Data Export

کاربر بتواند تمام اطلاعات را Export کند.

فرمت:

JSON


شامل:

Tasks

Categories

Tags

Notifications

Profile

Settings

باشد.

بخش بیست‌وهشتم — Import

Import باید:

فایل را انتخاب کند.

JSON را Parse کند.

Schema را Validate کند.

داده‌ها را Validate کند.

Duplicate ID را مدیریت کند.

Confirmation بگیرد.

Transaction اجرا کند.

داده‌ها را Restore کند.

در صورت خطا:

هیچ بخشی از Database نباید خراب شود.

بخش بیست‌ونهم — Backup

قابلیت:

Create Backup
Export Backup
Import Backup
Restore Backup


ایجاد کن.

در صورت امکان Backup را رمزگذاری کن.

از Android Storage Access Framework استفاده کن.

بخش سی‌ام — Theme

پشتیبانی از:

Light
Dark
System


تنظیمات با DataStore ذخیره شوند.

بخش سی‌ویکم — Persian RTL

کل برنامه فارسی باشد.

فعال کردن:

RTL


در کل UI.

متن‌ها:

فارسی

واضح

کاربرپسند

باشند.

بخش سی‌ودوم — Navigation

Navigation اصلی:

Dashboard
Tasks
Kanban
Calendar
Analytics
Notifications
Profile
Settings


در موبایل:

Bottom Navigation

در Tablet:

Navigation Rail / Navigation Drawer

بخش سی‌وسوم — UI/UX

طراحی باید مدرن و حرفه‌ای باشد.

از:

Material 3

Cards

Chips

Badges

FAB

Bottom Sheets

Dialogs

Snackbars

استفاده کن.

از Lucide React استفاده نکن.

معادل Native Android Icons استفاده کن.

از Motion Web استفاده نکن.

برای Animation از:

Compose Animation API


استفاده کن.

بخش سی‌وچهارم — Loading State

برای تمام عملیات Async:

Loading

Success

Error

Empty

در نظر بگیر.

بخش سی‌وپنجم — Error Handling

تمام خطاها مدیریت شوند.

مثلاً:

Database Error

Import Error

Export Error

Invalid Input

Notification Permission

Backup Error

UI نباید Crash کند.

بخش سی‌وششم — Empty State

برای صفحات بدون داده UI مناسب نمایش بده.

مثلاً:

هنوز وظیفه‌ای ایجاد نکرده‌اید.

اولین وظیفه خود را ایجاد کنید.


بخش سی‌وهفتم — امنیت

از:

Android Keystore

Encrypted Storage در صورت نیاز

Secure File Handling

استفاده کن.

اطلاعات حساس را Plain Text ذخیره نکن.

بخش سی‌وهشتم — Performance

رعایت:

LazyColumn

LazyGrid

Room Index

Efficient Query

Coroutines

Flow

StateFlow

Immutable State

از Recomposition غیرضروری جلوگیری کن.

UI Thread را Block نکن.

بخش سی‌ونهم — تست

Unit Test:

UseCase

ViewModel

Mapper

Validator

Database Test:

DAO

CRUD

Relations

Compose UI Test:

Create Task

Edit Task

Delete Task

Complete Task

Search

Filter

Kanban

End-to-End:

Create Profile
↓
Create Category
↓
Create Tag
↓
Create Task
↓
Set Priority
↓
Set Deadline
↓
Move Task
↓
Complete Task
↓
View Analytics
↓
Export
↓
Delete
↓
Import
↓
Restore


بخش چهلم — Offline Test

حتماً برنامه را با شرایط زیر تست کن:

Airplane Mode ON
Wi-Fi OFF
Mobile Data OFF


در این حالت موارد زیر باید کار کنند:

Dashboard

Task CRUD

Search

Filter

Sort

Kanban

Calendar

Jalali Calendar

Categories

Tags

Analytics

Notifications

Profile

Settings

Export

Import

بخش چهل‌ویکم — Migration

برای Room Migration Strategy داشته باش.

اگر در آینده Schema تغییر کرد:

Migration v1 → v2
Migration v2 → v3


اطلاعات کاربر نباید از بین برود.

بخش چهل‌ودوم — Build

پروژه باید با Gradle Kotlin DSL ساخته شود.

از Version Catalog استفاده کن.

خروجی:

./gradlew assembleDebug


و:

./gradlew assembleRelease


باید بدون Error اجرا شوند.

بخش چهل‌وسوم — کیفیت کد

کد باید:

Clean

Modular

Type-Safe

Maintainable

Scalable

Testable

باشد.

از:

any
Global Mutable State
Hardcoded Data
God Classes
Massive Composable
Business Logic in UI


اجتناب کن.

بخش چهل‌وچهارم — Definition of Done

پروژه زمانی Complete است که:

[ ] Native Android باشد

[ ] APK قابل نصب داشته باشد

[ ] کاملاً Offline باشد

[ ] Room Database داشته باشد

[ ] اطلاعات بعد از Restart حفظ شوند

[ ] CRUD کامل باشد

[ ] Search فعال باشد

[ ] Filter فعال باشد

[ ] Sorting فعال باشد

[ ] Kanban فعال باشد

[ ] Drag & Drop فعال باشد

[ ] Calendar فعال باشد

[ ] Jalali Calendar فعال باشد

[ ] Deadline فعال باشد

[ ] Local Notification فعال باشد

[ ] Analytics واقعی باشد

[ ] Category فعال باشد

[ ] Tag فعال باشد

[ ] Profile فعال باشد

[ ] Settings فعال باشد

[ ] Dark Mode فعال باشد

[ ] RTL فعال باشد

[ ] Export فعال باشد

[ ] Import فعال باشد

[ ] Backup فعال باشد

[ ] Restore فعال باشد

[ ] Error Handling فعال باشد

[ ] Loading State وجود داشته باشد

[ ] Empty State وجود داشته باشد

[ ] هیچ Button بدون عملکرد نباشد

[ ] هیچ Feature به‌صورت Fake نباشد

[ ] هیچ Core Feature وابسته به اینترنت نباشد

[ ] هیچ Core Feature وابسته به Supabase نباشد

[ ] هیچ Core Feature وابسته به Gemini نباشد

[ ] Build موفق باشد

[ ] Tests موفق باشند

[ ] Lint بدون خطا باشد

بخش چهل‌وپنجم — دستور اجرایی نهایی

این پروژه را به‌صورت یک مهاجرت ساده از Web به Android انجام نده.

ابتدا Repository مرجع را Analyze کن.

سپس یک Feature Inventory کامل ایجاد کن.

برای هر Feature مشخص کن:

Feature
↓
Reference Implementation
↓
Business Logic
↓
Native Android Equivalent
↓
Offline Implementation
↓
Database Requirement
↓
UI Screen
↓
Test Case


سپس پیاده‌سازی را مرحله‌به‌مرحله انجام بده.

ترتیب توسعه:

1. Project Setup
2. Architecture
3. Room Database
4. Data Layer
5. Domain Layer
6. Repository
7. Use Cases
8. ViewModels
9. Navigation
10. Dashboard
11. Task CRUD
12. Search
13. Filter
14. Sort
15. Kanban
16. Calendar
17. Jalali Calendar
18. Categories
19. Tags
20. Notifications
21. Analytics
22. Profile
23. Settings
24. Theme
25. Backup
26. Export / Import
27. Security
28. Testing
29. Performance
30. Build APK


پس از هر مرحله:

Compile
↓
Run
↓
Test
↓
Fix
↓
Continue


انجام بده.

در پایان این دستورات را اجرا کن:

./gradlew clean
./gradlew build
./gradlew test
./gradlew lint
./gradlew assembleDebug


تمام خطاها را قبل از تحویل برطرف کن.

خروجی نهایی مورد انتظار

در پایان باید یک پروژه واقعی Android ارائه شود که:

از پروژه مرجع از نظر قابلیت‌ها عقب‌تر نباشد،

اما از نظر معماری:

React/Vite Web
        ↓
Native Android


و از نظر داده:

Supabase / Cloud
        ↓
Room / SQLite / Local


و از نظر اجرا:

Browser
        ↓
Installed APK


و از نظر اتصال:

Internet Required
        ↓
Offline-First


تبدیل شده باشد.

هدف نهایی:

یک اپلیکیشن مدیریت وظایف فارسی، Native Android، قابل نصب، مستقل، سریع، امن، زیبا، کاملاً آفلاین و Production-Ready که تمام قابلیت‌های کاربردی پروژه مرجع را حفظ کرده باشد.

هیچ قابلیت موجود در پروژه مرجع را بدون بررسی حذف نکن.

اگر در پروژه مرجع قابلیتی وجود دارد که در این Specification ذکر نشده است، آن قابلیت را نیز شناسایی کرده و به Feature Inventory اضافه کن و سپس معادل Native Android و Offline آن را پیاده‌سازی کن.

قبل از اعلام اتمام پروژه، یک گزارش نهایی Feature Parity ارائه بده و برای هر قابلیت بنویس:

Reference Feature
Native Android Implementation
Offline Support
Database Support
Test Status


هرگز ادعا نکن قابلیتی پیاده‌سازی شده است مگر اینکه واقعاً در کد وجود داشته باشد و تست شده باشد.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://taskv02.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/63802fdd-ee89-4bfb-9abe-2518d36b3904).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
