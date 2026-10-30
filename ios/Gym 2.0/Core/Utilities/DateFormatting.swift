//
//  DateFormatting.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 15.09.2024.
//

import Foundation


func formatDate(date: Date) -> String{
    let dateFormatter = DateFormatter()
    dateFormatter.dateFormat = "dd.MM.yy"
    return String(dateFormatter.string(from: date))
}

func timeFromDate(date: Date) -> String{
    let dateFormatter = DateFormatter()
    dateFormatter.dateFormat = "HH:mm"
    return String(dateFormatter.string(from: date))
}
