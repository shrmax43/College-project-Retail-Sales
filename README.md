# Retail Analytics & Business Intelligence Dashboard

A web-based Retail Analytics Dashboard that transforms retail sales datasets into meaningful business insights through KPI tracking, trend visualization, product analysis, and customer analytics.

## Overview

Retail businesses often store sales data in CSV or Excel files but lack an easy way to generate actionable insights from that data.

This project provides a user-friendly analytics platform that allows users to:

* Upload retail datasets
* Map dataset columns dynamically
* Generate KPIs automatically
* Visualize sales trends
* Analyze product performance
* Extract business insights

The system is designed as a lightweight alternative to traditional business intelligence tools for educational and personal analytics purposes.

---

## Features

### Dataset Management

* CSV Upload Support
* Excel (XLSX) Upload Support
* Dataset Validation
* Data Preview

### Dynamic Label Mapping

Map different dataset columns to:

* Revenue
* Date
* Quantity
* Product
* Customer
* Country
* Invoice Number

This allows the platform to work with datasets that use different column names.

### Analytics Dashboard

Automatically generates:

* Total Revenue
* Total Transactions
* Total Customers
* Average Order Value

### Visualizations

* Monthly Revenue Trends
* Revenue by Country
* Product Performance Analysis
* KPI Summary Cards

### Business Insights

Automatically highlights:

* Best Performing Month
* Top Revenue Country
* Best Selling Product
* Customer Statistics

---

## Technology Stack

### Frontend

* HTML5
* CSS3
* JavaScript
* Chart.js

### Backend

* Node.js
* Express.js

### Database

* PostgreSQL

### Version Control

* Git
* GitHub

---

## Project Architecture

```text
Retail Dataset (CSV/XLSX)
            │
            ▼
     Upload Module
            │
            ▼
    Label Mapping Module
            │
            ▼
   Analytics Processing
            │
    ┌───────┼───────┐
    ▼       ▼       ▼
 KPI      Charts  Insights
    │       │       │
    └───────┼───────┘
            ▼
 Analytics Dashboard
            │
            ▼
 PostgreSQL Storage
```

---

## Database Components

### Datasets

Stores uploaded dataset metadata.

### Label Mappings

Stores column-to-field mappings.

### Analytics

Stores generated analytics information.

### Insights

Stores generated business insights.

---

## Installation

### Clone Repository

```bash
git clone https://github.com/your-username/retail-analytics-dashboard.git
```

```bash
cd retail-analytics-dashboard
```

### Install Dependencies

```bash
npm install
```

### Configure PostgreSQL

Create a PostgreSQL database and update:

```env
DATABASE_URL=your_database_connection_string
```

### Start Backend

```bash
npm run server
```

### Start Frontend

```bash
npm run dev
```

---

## Example Analytics

The dashboard can generate:

* Revenue Analysis
* Sales Trends
* Product Performance Reports
* Country-Wise Revenue Distribution
* Customer Statistics

---

## Learning Outcomes

This project demonstrates:

* Frontend Development
* Backend Development
* Database Design
* Data Processing
* Analytics Generation
* Dashboard Development
* API Integration
* System Debugging

---

## Future Scope

Potential enhancements:

* AI-powered recommendations
* Sales forecasting
* Inventory prediction
* Customer segmentation
* PDF report generation
* Multi-dataset comparison
* Advanced filtering and search

---

## License

This project is open-source and available under the MIT License.

---

## Author

Developed as a Retail Analytics & Business Intelligence academic project demonstrating data processing, analytics generation, and visualization using modern web technologies.
